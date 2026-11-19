import { useEffect, useState } from 'react';

/** True when the primary input supports hover (mouse/trackpad), not touch-only. */
export function useHoverCapable() {
  const [hoverCapable, setHoverCapable] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setHoverCapable(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return hoverCapable;
}
