import React from "react";
import { Zap, Cpu, Activity, Gauge, Cable, Check } from "lucide-react";

interface SpecSummaryProps {
  specs: Record<string, unknown>;
}

export function SpecSummary({ specs }: SpecSummaryProps) {
  if (!specs || Object.keys(specs).length === 0) {
    return (
      <div className="text-xs text-obsidian-500 italic">
        Specifications awaiting datasheet parsing.
      </div>
    );
  }

  const badges: Array<{ label: string; value: string; icon?: React.ComponentType<{ className?: string }> }> = [];

  // Voltage
  if (specs.supplyVoltageMinV !== undefined && specs.supplyVoltageMaxV !== undefined) {
    badges.push({
      label: "Voltage",
      value: `${specs.supplyVoltageMinV}V - ${specs.supplyVoltageMaxV}V`,
      icon: Zap,
    });
  } else if (specs.operatingVoltageMinV !== undefined && specs.operatingVoltageMaxV !== undefined) {
    badges.push({
      label: "Voltage",
      value: `${specs.operatingVoltageMinV}V - ${specs.operatingVoltageMaxV}V`,
      icon: Zap,
    });
  } else if (specs.inputVoltageMinV !== undefined && specs.inputVoltageMaxV !== undefined) {
    badges.push({
      label: "Input Range",
      value: `${specs.inputVoltageMinV}V - ${specs.inputVoltageMaxV}V`,
      icon: Zap,
    });
  } else if (specs.ratedVoltageV !== undefined) {
    badges.push({
      label: "Rated",
      value: `${specs.ratedVoltageV}V`,
      icon: Zap,
    });
  }

  // Current
  if (specs.maxCurrentRmsA !== undefined) {
    badges.push({
      label: "Current",
      value: `${specs.maxCurrentRmsA}A RMS`,
      icon: Activity,
    });
  } else if (specs.maxCurrentContinuousA !== undefined) {
    badges.push({
      label: "Continuous",
      value: `${specs.maxCurrentContinuousA}A`,
      icon: Activity,
    });
  } else if (specs.maxOutputCurrentA !== undefined) {
    badges.push({
      label: "Output",
      value: `${specs.maxOutputCurrentA}A Max`,
      icon: Activity,
    });
  } else if (specs.ratedCurrentPerPhaseA !== undefined) {
    badges.push({
      label: "Phase",
      value: `${specs.ratedCurrentPerPhaseA}A / phase`,
      icon: Activity,
    });
  } else if (specs.ratedCurrentA !== undefined) {
    badges.push({
      label: "Rating",
      value: `${specs.ratedCurrentA}A`,
      icon: Activity,
    });
  }

  // Logic Voltage
  if (specs.logicVoltage) {
    badges.push({
      label: "Logic",
      value: String(specs.logicVoltage),
      icon: Cpu,
    });
  } else if (specs.logicVoltageV) {
    badges.push({
      label: "Logic",
      value: `${specs.logicVoltageV}V`,
      icon: Cpu,
    });
  }

  // Protocols / Interface
  if (Array.isArray(specs.controlInterface)) {
    badges.push({
      label: "Control",
      value: specs.controlInterface.join(", "),
      icon: Cable,
    });
  } else if (Array.isArray(specs.interface)) {
    badges.push({
      label: "Bus",
      value: specs.interface.join(", "),
      icon: Cable,
    });
  } else if (Array.isArray(specs.interfaces)) {
    badges.push({
      label: "Busses",
      value: specs.interfaces.slice(0, 3).join(", "),
      icon: Cable,
    });
  }

  // Stepper / Mechanical
  if (specs.stepAngleDeg) {
    badges.push({
      label: "Step",
      value: `${specs.stepAngleDeg}° (200 step)`,
      icon: Gauge,
    });
  }
  if (specs.pitchMm && specs.pinCount) {
    badges.push({
      label: "Header",
      value: `${specs.pinCount}-pin (${specs.pitchMm}mm)`,
      icon: Cable,
    });
  }

  // Fallback
  if (badges.length === 0) {
    Object.entries(specs)
      .slice(0, 4)
      .forEach(([k, v]) => {
        badges.push({
          label: k.replace(/([A-Z])/g, " $1").trim(),
          value: Array.isArray(v) ? v.join(", ") : String(v),
        });
      });
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-obsidian-900/90 border border-obsidian-800 p-2.5">
      {badges.slice(0, 4).map((badge, idx) => {
        const Icon = badge.icon ?? Check;
        return (
          <div key={idx} className="flex flex-col min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-obsidian-400 flex items-center gap-1">
              <Icon className="h-3 w-3 text-rcb-red shrink-0" />
              <span className="truncate">{badge.label}</span>
            </span>
            <span className="font-semibold text-xs text-white truncate mt-0.5" title={badge.value}>
              {badge.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
