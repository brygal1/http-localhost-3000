import ShiftAheadApp from "./ShiftAheadApp";
import { getDefaultWorkerId, listWorkers } from "@/data/repository";

export default function Home() {
  return (
    <ShiftAheadApp
      workers={listWorkers()}
      defaultWorkerId={getDefaultWorkerId()}
    />
  );
}
