// Switch pill reaproveitado (Configurações → Microfone e, agora, o
// checkbox de "som do PC" no ScreenSharePicker) — só utilitários do
// Tailwind, sem CSS novo.
export function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-sm text-mist">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
          checked ? 'border-volt bg-volt/30' : 'border-line bg-panel-3'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? 'translate-x-4 bg-volt' : 'translate-x-0.5 bg-mist-faint'
          }`}
        />
      </span>
    </button>
  )
}
