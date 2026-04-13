interface Tab {
  key: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export default function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border mb-4 -mx-1 px-1">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 ${
            active === tab.key
              ? 'text-primary border-primary'
              : 'text-on-surface-variant border-transparent hover:text-foreground hover:border-border'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
