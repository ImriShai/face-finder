import Chip from '@mui/material/Chip'
import { useTranslation } from 'react-i18next'

interface Props {
  confidence: number
}

export default function ConfidenceChip({ confidence }: Props) {
  const { t } = useTranslation()
  const pct = Math.round(confidence * 100)
  const color = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'default'
  return <Chip label={t('confidencechip.percent', { pct })} color={color} size="small" />
}
