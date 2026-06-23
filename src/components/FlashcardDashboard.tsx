import { useState } from "react";
import FlashcardGenerator from "@/components/FlashcardGenerator";
import FlashcardCollection from "@/components/FlashcardCollection";

export default function FlashcardDashboard() {
  const [refreshCounter, setRefreshCounter] = useState(0);

  function handleComplete(acceptedCount: number) {
    if (acceptedCount > 0) {
      setRefreshCounter((c) => c + 1);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Generuj fiszki</h2>
        <FlashcardGenerator onComplete={handleComplete} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Moja kolekcja</h2>
        <FlashcardCollection refreshKey={refreshCounter} />
      </section>
    </div>
  );
}
