import Chip from '@mui/material/Chip'

interface Props {
  confidence: number
}

export default function ConfidenceChip({ confidence }: Props) {
  const pct = Math.round(confidence * 100)
  const color = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'default'
  return <Chip label={`${pct}%`} color={color} size="small" />
}
