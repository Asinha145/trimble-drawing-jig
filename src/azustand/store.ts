import { create } from 'zustand'

///Main Zustand store for all global states and operations ot change states


/*
VERSIONS NUMBER
0 - Legacy milestone 1 (compares all older IFC files)
1 - Milestone 2 version rendering assemly, revision + dimension feature
2 - TBA */

export type UIStore = {
    pluginVersion: number
}

///To consume in front end JSX use const {isLegacy, setLegacy} = useUIStore()
export const useUIStore = create<UIStore>() ((set) => ({
    pluginVersion: 1
}))


