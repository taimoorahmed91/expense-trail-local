import { createContext, useContext, useMemo, useState } from 'react';

const Ctx = createContext({ mode: 'my', setMode: () => {} });

export function ViewModeProvider({ initial = 'my', children }) {
  const [mode, setMode] = useState(initial);
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useViewMode = () => useContext(Ctx);
