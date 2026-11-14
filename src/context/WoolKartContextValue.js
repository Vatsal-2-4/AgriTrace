import { createContext, useContext } from 'react';

export const WoolKartContext = createContext();

export const useWoolKart = () => useContext(WoolKartContext);
