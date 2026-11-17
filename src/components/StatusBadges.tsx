import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'Emergency') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FDEBEC] px-2 py-0.5 text-xs font-semibold text-[#E53945] whitespace-nowrap">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Emergency
      </span>
    );
  }
  if (priority === 'Urgent') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FEF5E7] px-2 py-0.5 text-xs font-semibold text-[#C97A16] whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Urgent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EAF7F1] px-2 py-0.5 text-xs font-semibold text-[#1E8E5E] whitespace-nowrap">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Routine
    </span>
  );
}

export function RequestStatusLabel({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Fulfilled: 'text-[#1E8E5E] bg-[#EAF7F1]',
    Matched: 'text-[#1E8E5E] bg-[#EAF7F1]',
    'Partially Fulfilled': 'text-[#C97A16] bg-[#FEF5E7]',
    Processing: 'text-[#17264F] bg-[#EEF1F7]',
    Pending: 'text-[#C97A16] bg-[#FEF5E7]',
    Rejected: 'text-[#E53945] bg-[#FDEBEC]',
    Cancelled: 'text-[#7B8499] bg-[#F4F6FA]',
  };
  const cls = styles[status] || 'text-[#202A44] bg-[#F4F6FA]';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

export function StockStatusLabel({ status }: { status: string }) {
  if (status === 'Expired' || status === 'Critical' || status === 'Depleted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#FDEBEC] px-2 py-0.5 text-xs font-semibold text-[#E53945] whitespace-nowrap">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {status}
      </span>
    );
  }
  if (status === 'Low Stock' || status === 'Limited') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#FEF5E7] px-2 py-0.5 text-xs font-semibold text-[#C97A16] whitespace-nowrap">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF7F1] px-2 py-0.5 text-xs font-semibold text-[#1E8E5E] whitespace-nowrap">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {status}
    </span>
  );
}

export function BloodGroupTag({ group }: { group: string }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[2.5rem] rounded-md bg-[#FDEBEC] px-2 py-0.5 font-mono-tabular text-xs font-bold text-[#E53945]">
      {group}
    </span>
  );
}
