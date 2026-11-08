import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import CameraDialog from './CameraDialog'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export default function UploadDropzone({ onFileSelected, disabled }: Props) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)

  const accept = useCallback(
    (file: File) => {
      setPreview(URL.createObjectURL(file))
      onFileSelected(file)
    },
    [onFileSelected],
  )

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0]
      if (file) accept(file)
    },
    [accept],
  )

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled,
    noClick: true,  // buttons handle opening; whole area stays drag-only
  })

  return (
    <>
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          borderRadius: 3,
          p: 4,
          textAlign: 'center',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
      >
        <input {...getInputProps()} />

        {preview ? (
          /* ── Preview state ── */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Box
              component="img"
              src={preview}
              alt={t('uploaddropzone.selfiePreviewAlt')}
              sx={{ width: 180, height: 180, objectFit: 'cover', borderRadius: '50%', boxShadow: 3 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon color="success" fontSize="small" />
              <Typography variant="body2" color="text.secondary">
                {t('uploaddropzone.readyToSearch')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CameraAltIcon />}
                onClick={() => setShowCamera(true)}
                disabled={disabled}
              >
                {t('uploaddropzone.retake')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PhotoLibraryIcon />}
                onClick={openPicker}
                disabled={disabled}
              >
                {t('uploaddropzone.change')}
              </Button>
            </Box>
          </Box>
        ) : (
          /* ── Empty state ── */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {isDragActive ? t('uploaddropzone.dropSelfieHere') : t('uploaddropzone.uploadSelfie')}
            </Typography>

            {!isDragActive && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {t('uploaddropzone.takeOrPick')}
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<CameraAltIcon />}
                    onClick={() => setShowCamera(true)}
                    disabled={disabled}
                  >
                    {t('uploaddropzone.camera')}
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<PhotoLibraryIcon />}
                    onClick={openPicker}
                    disabled={disabled}
                  >
                    {t('uploaddropzone.gallery')}
                  </Button>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  {t('uploaddropzone.orDragDrop')}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      <CameraDialog
        open={showCamera}
        onCapture={(file) => { accept(file); setShowCamera(false) }}
        onClose={() => setShowCamera(false)}
      />
    </>
  )
}
