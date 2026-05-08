import React, { createContext, useContext } from "react";

const TeamleaderModalContext = createContext(null);

export const TeamleaderModalProvider = ({ value, children }) => {
  return (
    <TeamleaderModalContext.Provider value={value}>
      {children}
    </TeamleaderModalContext.Provider>
  );
};

export const useTeamleaderModal = () => {
  const context = useContext(TeamleaderModalContext);
  if (!context) {
    throw new Error("useTeamleaderModal must be used within TeamleaderModalProvider.");
  }
  return context;
};
