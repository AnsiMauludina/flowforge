# Code Review — PR #47: `feat: add bulk workflow trigger endpoint`

**Reviewer:** @ansimauludina  
**Author:** @teammate  
**Branch:** `feat/bulk-trigger` → `main`

---

## Code Under Review

```go
// handler/bulk_trigger.go

func (h *Handler) BulkTriggerWorkflows(c *gin.Context) {
	var req struct {
		IDs []string `json:"ids"`
	}
	c.BindJSON(&req)

	tenantID := c.GetHeader("X-Tenant-ID")

	results := map[string]string{}

	for _, id := range req.IDs {
		query := fmt.Sprintf(
			"SELECT id, dag FROM workflow_definitions WHERE id = '%s'",
			id,
		)
		row := h.db.QueryRow(query)

		var workflowID, dagJSON string
		row.Scan(&workflowID, &dagJSON)

		go h.executeWorkflow(workflowID, dagJSON)
		results[id] = "triggered"
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

func (h *Handler) PollRunStatus(c *gin.Context) {
	runID := c.Param("run_id")
	for {
		status := h.getRunStatus(runID)
		if status == "success" || status == "failed" {
			c.JSON(http.StatusOK, gin.H{"status": status})
			return
		}
	}
}
```

---

## Comments

**[line 14] — `BindJSON` error-nya ga di-handle**  
Kalau body-nya kosong atau malformed, `req.IDs` jadi nil dan handler tetap return 200. Ganti ke `ShouldBindJSON` dan early return kalau error.

---

**[line 17] — 🔴 Tenant ID dari header, bukan JWT**  
Ini berbahaya — siapa aja bisa kirim `X-Tenant-ID` sembarangan dan akses data tenant lain. Harusnya pakai `appMiddleware.GetTenantID(c)` seperti handler lainnya.

---

**[line 22–24] — 🔴 SQL injection**  
`fmt.Sprintf` langsung ke query adalah SQL injection klasik. Pkai parameterized query `$1, $2` dan tambahkan `AND tenant_id = $2` sekalian, karena sekarang filter tenant-nya juga hilang.

---

**[line 29] — `row.Scan` error diabaikan**  
Kalau workflow tidak ketemu, `workflowID` dan `dagJSON` kosong tapi `executeWorkflow` tetap dipanggil. Cek `sql.ErrNoRows` dan `continue` kalau tidak ketemu.

---

**[line 31] — tidak ada batas jumlah goroutine**  
Kalau ada yang kirim 1000 IDs, langsung spawn 1000 goroutine sekaligus. Batasi max IDs per request (misal 20) dan tolak kalau lebih.

---

**[line 49–55] — 🔴 Infinite loop**  
`PollRunStatus` loop tanpa sleep, tanpa timeout, tanpa cek `ctx.Done()`. Kalau client disconnect handler tetap jalan selamanya dan ngabisin koneksi DB. Kita udah punya WebSocket, kenapa tidak pakai itu aja? Kalau memang harus polling, minimal tambah `time.Sleep(500ms)` dan cek context.

---

**Overall: Request Changes 🚫**  
Ada 3 isu critical (tenant bypass, SQL injection, infinite loop) yang harus fix dulu sebelum bisa di-merge. Yang lainnya bisa diperbaiki sekalian.
