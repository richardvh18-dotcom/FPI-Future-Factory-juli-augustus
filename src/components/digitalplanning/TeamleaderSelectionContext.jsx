import React, { createContext, useContext } from "react";

const TeamleaderSelectionContext = createContext(null);

export const TeamleaderSelectionProvider = ({ value, children }) => {
  return (
    <TeamleaderSelectionContext.Provider value={value}>
      {children}
    </TeamleaderSelectionContext.Provider>
  );
};

export const useTeamleaderSelection = () => {
  const context = useContext(TeamleaderSelectionContext);
  if (!context) {
    throw new Error("useTeamleaderSelection must be used within TeamleaderSelectionProvider.");
  }
  return context;
};
