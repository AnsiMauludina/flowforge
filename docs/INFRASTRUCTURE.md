# Infrastructure Design — FlowForge (AWS)

Ini desain kalau FlowForge mau di-deploy ke production di AWS. Tidak semua ini perlu dari hari pertama — bagian bawah ada catatan mana yang prioritas.

---

## Architecture Overview

```
                         ┌─────────────────────────────┐
                         │        Route 53 (DNS)        │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   CloudFront (CDN + WAF)     │
                         │  static assets + API cache   │
                         └──────┬───────────────┬───────┘
                                │               │
               ┌────────────────▼──┐     ┌──────▼──────────────┐
               │  S3 (Frontend)    │     │  ALB (Application    │
               │  React build      │     │  Load Balancer)      │
               └───────────────────┘     └──────┬──────────────┘
                                                │
                               ┌────────────────▼────────────────┐
                               │         ECS Fargate              │
                               │   ┌──────────┐ ┌──────────┐    │
                               │   │ API task │ │ API task │    │
                               │   └──────────┘ └──────────┘    │
                               │        (auto-scaled)            │
                               └───────┬──────────────┬──────────┘
                                       │              │
                        ┌──────────────▼──┐    ┌──────▼────────────┐
                        │  RDS PostgreSQL  │    │  ElastiCache Redis │
                        │  (Multi-AZ)      │    │  (rate limiter +   │
                        └─────────────────┘    │   session cache)   │
                                               └────────────────────┘
```

---

## Komponen dan Alasannya

### Frontend — S3 + CloudFront
React build di-upload ke S3, di-serve lewat CloudFront. Lebih murah dan lebih cepat dibanding naruh Nginx di EC2. CloudFront juga handle SSL termination.

WAF di CloudFront bisa block request yang mencurigakan sebelum nyentuh API sama sekali.

### API — ECS Fargate
Pakai Fargate bukan EC2 langsung biar tidak perlu urus instance management. Container-nya sudah ada (multi-stage Dockerfile), tinggal define task definition.

Auto-scaling berdasarkan CPU usage — kalau CPU > 70% selama 2 menit, scale out. Minimum 2 task supaya tidak single point of failure, maksimum tersesuaikan budget.

ALB yang depan ECS handle health check `/health` — kalau task tidak respond, ALB otomatis stop kirim traffic ke sana.

### Database — RDS PostgreSQL (Multi-AZ)
Multi-AZ artinya ada replica di AZ lain yang auto-failover kalau primary down. Downtime biasanya < 1 menit untuk failover.

Untuk read-heavy query (dashboard, run history), bisa tambah read replica dan arahkan `SELECT` ke sana — tapi ini opsional untuk MVP.

Parameter Groups yang perlu di-tune:
- `max_connections` — default 100 sering kurang kalau Fargate scale out
- `shared_buffers` — set ke ~25% RAM instance

### Redis — ElastiCache
Dua fungsi: gantikan in-memory rate limiter yang sekarang (biar consistent di semua task), dan bisa dipakai untuk session cache kalau nanti JWT mau bisa di-revoke.

Pakai cluster mode off untuk simplicity — single primary + 1 replica cukup untuk kebutuhan ini.

### Secrets — AWS Secrets Manager
`JWT_SECRET`, `DB_URL`, `ANTHROPIC_API_KEY` jangan di env var langsung. Simpan di Secrets Manager, ECS task pull saat startup. Rotation otomatis bisa di-setup untuk DB credentials.

---

## Deployment Flow

```
Push ke main
     │
     ▼
GitHub Actions CI
  - test + lint
  - docker build
  - push image ke ECR
     │
     ▼
ECS rolling deployment
  - task baru naik dulu
  - health check pass
  - task lama turun
  (zero downtime)
```

---

## Hal yang Belum Dihandle (known gaps)

**Cron scheduler** — sekarang jalan in-process, jadi kalau ada 2 Fargate task, cron jalan 2x. Fix-nya: pindah ke EventBridge Scheduler yang trigger satu Lambda/API call, atau pakai advisory lock di PostgreSQL.

**WebSocket scaling** — ALB sudah support sticky sessions untuk WebSocket, tapi kalau task yang handle koneksi WS di-terminate saat scale-down, client perlu reconnect. Reconnect logic sudah ada di frontend, jadi ini acceptable untuk sekarang.

**Observability** — belum ada tracing. Minimal setup CloudWatch Logs untuk container logs, dan CloudWatch Alarm untuk error rate > 1% dan p99 latency > 500ms.

---

## Estimasi Biaya (ap-southeast-1, rough)

| Komponen | Spec | ~Biaya/bulan |
|----------|------|--------------|
| ECS Fargate | 2 task × 0.5 vCPU, 1GB | ~$30 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ | ~$80 |
| ElastiCache | cache.t3.micro | ~$15 |
| ALB | - | ~$20 |
| CloudFront + S3 | low traffic | ~$5 |
| **Total** | | **~$150/bulan** |

Ini bisa turun signifikan kalau pakai Reserved Instances untuk RDS (1 tahun ~40% lebih murah).
