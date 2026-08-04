export const shouldResetOrderLabelMachineState = (previousMachine: string, nextMachine: string) => {
  if (!previousMachine || !nextMachine) return false;
  return previousMachine !== nextMachine;
};
