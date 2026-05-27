import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Badge from './Badge'

describe('Badge', () => {
  it('renders the status text by default', () => {
    render(<Badge status="success" />)
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('renders custom label when provided', () => {
    render(<Badge status="failed" label="Error" />)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.queryByText('failed')).not.toBeInTheDocument()
  })

  it('applies correct color class for running status', () => {
    render(<Badge status="running" />)
    const badge = screen.getByText('running').closest('span')
    expect(badge).toHaveClass('bg-indigo-50', 'text-indigo-600')
  })

  it('applies correct color class for success status', () => {
    render(<Badge status="success" />)
    const badge = screen.getByText('success').closest('span')
    expect(badge).toHaveClass('bg-emerald-50', 'text-emerald-600')
  })

  it('applies correct color class for failed status', () => {
    render(<Badge status="failed" />)
    const badge = screen.getByText('failed').closest('span')
    expect(badge).toHaveClass('bg-red-50', 'text-red-600')
  })
})
