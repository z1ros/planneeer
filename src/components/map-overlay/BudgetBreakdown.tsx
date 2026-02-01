import type { BudgetData } from './RightItineraryPanel';

interface BudgetBreakdownProps {
  budget: BudgetData;
  totalBudget: number;
}

export default function BudgetBreakdown({ budget, totalBudget }: BudgetBreakdownProps) {
  return (
    <div className="bg-white/5 rounded-xl p-3.5 border border-white/[0.08] mt-4 shrink-0">
      <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-white/10">
        <span className="text-white text-sm font-medium">Budget Breakdown</span>
        <span className="text-white text-base font-semibold">{totalBudget.toFixed(2)}$</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-white/60 text-[13px]">
          <span>Food</span>
          <span>{budget.food.toFixed(2)}$</span>
        </div>
        <div className="flex justify-between items-center text-white/60 text-[13px]">
          <span>Activity</span>
          <span>{budget.activity.toFixed(2)}$</span>
        </div>
        <div className="flex justify-between items-center text-white/60 text-[13px]">
          <span>Transit</span>
          <span>{budget.transit.toFixed(0)}$</span>
        </div>
      </div>
    </div>
  );
}
