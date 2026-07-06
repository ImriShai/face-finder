import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ConfidenceChip from './ConfidenceChip'

describe('ConfidenceChip', () => {
  it('displays confidence as a percentage', () => {
    render(<ConfidenceChip confidence={0.93} />)
    expect(screen.getByText('93%')).toBeInTheDocument()
  })

  it('rounds the percentage', () => {
    render(<ConfidenceChip confidence={0.876} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('uses success color for high confidence (>= 80%)', () => {
    const { container } = render(<ConfidenceChip confidence={0.85} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders 0% for zero confidence', () => {
    render(<ConfidenceChip confidence={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
