// Theme — BAWAR logo: electric blue #0E4EC9 + neon lime #6FE800
export const theme = {
  fonts: {
    primary: 'font-sans',
    heading: 'font-heading',
    mono: 'font-mono',

    sizes: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
    },

    weights: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },

  form: {
    header: {
      add: 'bg-gradient-to-r from-primary to-primary-dark',
      edit: 'bg-gradient-to-r from-accent to-primary',
      details: 'bg-gradient-to-r from-primary via-accent to-primary-dark',
    },
    sections: {
      personal: 'bg-gradient-to-r from-muted/50 to-muted',
      academic: 'bg-gradient-to-r from-accent/10 to-accent/20',
      security: 'bg-gradient-to-r from-primary/5 to-accent/10',
      contact: 'bg-gradient-to-r from-primary/10 to-primary/20',
    },
    icons: {
      personal: 'text-muted-foreground',
      academic: 'text-accent',
      security: 'text-accent',
      contact: 'text-primary',
    },
  },

  ui: {
    card: 'bg-card rounded-xl shadow-subtle border border-border',
    input: 'border-input focus:border-primary focus:ring-2 focus:ring-primary/20',
    button: {
      primary:
        'bg-primary hover:bg-primary-hover text-primary-foreground shadow-subtle',
      secondary:
        'bg-accent hover:bg-accent/90 text-accent-foreground shadow-subtle',
      brand:
        'bg-gradient-to-r from-primary to-accent text-white hover:opacity-95 shadow-medium',
    },
    text: {
      primary: 'text-foreground',
      secondary: 'text-muted-foreground',
      brand: 'text-primary',
      accent: 'text-accent',
      error: 'text-destructive',
    },
  },
};
