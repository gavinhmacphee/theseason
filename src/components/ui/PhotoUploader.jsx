import { useRef, useState } from 'react'

export default function PhotoUploader({ onPhoto, preview, className = '' }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    onPhoto(file)
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      {preview ? (
        <div className="relative">
          <img src={preview} alt="" className="w-full h-48 object-cover" />
          <button
            type="button"
            onClick={() => {
              onPhoto(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="absolute top-2 right-2 bg-black/60 text-white w-7 h-7 flex items-center justify-center text-sm cursor-pointer"
          >
            &times;
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          className={`w-full py-8 border-2 border-dashed cursor-pointer text-sm text-muted transition-colors ${
            dragOver ? 'border-brand bg-brand/5' : 'border-border hover:border-muted'
          }`}
        >
          Tap to add a photo
        </button>
      )}
    </div>
  )
}
