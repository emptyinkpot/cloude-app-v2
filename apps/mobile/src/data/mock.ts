export const trendPoints = [720, 760, 810, 845, 910, 940, 980, 930];

export const devices = [
  {
    id: "co2-sensor-01",
    name: "CO2 Detector",
    type: "sensor",
    connectivity: "wifi",
    isOnline: true,
    isOn: true,
    currentValue: "940 ppm"
  },
  {
    id: "vent-01",
    name: "Fresh Air Fan",
    type: "ventilation",
    connectivity: "wifi",
    isOnline: true,
    isOn: false,
    currentValue: "Idle"
  },
  {
    id: "bridge-01",
    name: "BLE Bridge",
    type: "gateway",
    connectivity: "bluetooth",
    isOnline: true,
    isOn: true,
    currentValue: "Connected"
  }
];

export const scenes = [
  {
    id: "home",
    name: "Home mode",
    description: "Resume normal indoor monitoring and comfort control."
  },
  {
    id: "away",
    name: "Away mode",
    description: "Lower device activity and keep alert push enabled."
  },
  {
    id: "vent",
    name: "Ventilation mode",
    description: "Prioritize airflow when CO2 trend approaches warning range."
  }
];

export const alertHistory = [
  "09:20 CO2 exceeded level-1 threshold at 1030 ppm.",
  "09:42 Ventilation mode executed automatically.",
  "10:05 CO2 returned to safe band under 900 ppm."
];
