
import { WorkstationHubProps } from "../components/digitalplanning/WorkstationTypes";
import { useWorkstationData } from "./workstation/useWorkstationData";
import { useWorkstationActions } from "./workstation/useWorkstationActions";

export const useWorkstationState = (props: WorkstationHubProps) => {
    const data = useWorkstationData(props);
    const actions = useWorkstationActions(data);
    
    return {
        ...data,
        ...actions
    };
};
