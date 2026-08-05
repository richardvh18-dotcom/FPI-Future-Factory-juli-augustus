import React from "react";
import { useAutoLogout } from "../hooks/useAutoLogout";
import AutoLogoutWarning from "./AutoLogoutWarning";

export interface AutoLogoutManagerProps {
  isLoggedIn: boolean;
  timeoutMinutes?: number;
  warningMinutes?: number;
}

const AutoLogoutManager = ({ 
  isLoggedIn, 
  timeoutMinutes = 60, 
  warningMinutes = 5 
}: AutoLogoutManagerProps) => {
  const { showWarning, remainingTime, dismissWarning } = useAutoLogout(
    timeoutMinutes,
    warningMinutes,
    isLoggedIn
  );

  if (!showWarning) {
    return null;
  }

  return (
    <AutoLogoutWarning 
      remainingTime={remainingTime} 
      onDismiss={dismissWarning} 
    />
  );
};

export default AutoLogoutManager;
