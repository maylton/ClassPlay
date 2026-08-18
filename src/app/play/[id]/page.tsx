import { GameHub } from "@/components/GameHub";
export default async function PlayPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <GameHub activityId={id}/>;}
