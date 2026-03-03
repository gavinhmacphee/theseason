const base = 'inline-flex items-center justify-center gap-2 font-semibold text-[15px] transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

const variants = {
  primary: 'bg-[var(--brand,#1B4332)] text-white hover:opacity-90',
  accent: 'bg-accent text-white hover:opacity-90',
  ghost: 'bg-transparent text-muted border border-border hover:bg-border-light',
  danger: 'bg-loss text-white hover:opacity-90',
}

const sizes = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-6 py-3',
  lg: 'px-8 py-3.5 text-base',
  full: 'px-6 py-3.5 text-base w-full',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
