import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { getEvents, saveEvents } from '../services/api'
import type { EventDef } from '../types'

// <input type="datetime-local"> uses "YYYY-MM-DDTHH:mm"; the API stores full ISO.
function toLocalInput(iso: string): string {
  return iso ? iso.slice(0, 16) : ''
}

/** Admin editor for the event sections used to group search results. */
export default function EventsEditor() {
  const [rows, setRows] = useState<EventDef[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    getEvents()
      .then(setRows)
      .catch(() => setRows([]))
  }, [])

  function update(i: number, patch: Partial<EventDef>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function add() {
    setRows((r) => [...r, { label: '', starts_at: '' }])
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const cleaned = rows.filter((r) => r.label.trim() && r.starts_at)
      await saveEvents(cleaned)
      setRows(cleaned)
      setMsg({ ok: true, text: 'Saved.' })
    } catch {
      setMsg({ ok: false, text: 'Save failed. Check the admin password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Split the gallery timeline into named sections. Each photo is grouped into the
        latest event that started at or before it was taken. Leave the list empty to
        disable grouping.
      </Typography>

      {rows.map((row, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            label="Event name"
            size="small"
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            sx={{ flex: 1, minWidth: 160 }}
          />
          <TextField
            label="Starts at"
            type="datetime-local"
            size="small"
            value={toLocalInput(row.starts_at)}
            onChange={(e) => update(i, { starts_at: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <IconButton onClick={() => remove(i)} aria-label="Remove event">
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Button startIcon={<AddIcon />} onClick={add}>
          Add event
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save events'}
        </Button>
      </Box>

      {msg && (
        <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mt: 2 }}>
          {msg.text}
        </Alert>
      )}
    </Box>
  )
}
