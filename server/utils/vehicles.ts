/**
 * Utility per il calcolo dei mezzi di trasporto per il preventivatore.
 * Calcola il numero di viaggi necessari in base al peso totale e distanza.
 */

export interface VehicleCalculation {
  totalWeight: number;
  distance: number;
  vehicleCapacity: number;
  suggestedTrips: number;
  estimatedCost: number;
  isValid: boolean;
  error?: string;
}

const DEFAULT_VEHICLE_CAPACITY_KG = 3000; // Portata media in kg
const BASE_TRIP_COST = 150; // Costo base per viaggio in €
const COST_PER_KM = 1.2; // Costo per km (solo andata, la funzione considera A/R)

/**
 * Calcola il numero di viaggi suggeriti in base al peso totale.
 * 
 * @param totalWeight - Peso totale in kg (deve essere >= 0)
 * @param distance - Distanza SOLO ANDATA in km (deve essere >= 0)
 * @param vehicleCapacity - Capacità del mezzo in kg (default 3000kg, deve essere > 0)
 * @returns Oggetto con calcoli del trasporto
 */
export function calculateVehicles(
  totalWeight: number,
  distance: number,
  vehicleCapacity: number = DEFAULT_VEHICLE_CAPACITY_KG
): VehicleCalculation {
  // Validazione input
  if (totalWeight < 0) {
    return {
      totalWeight: 0,
      distance: 0,
      vehicleCapacity,
      suggestedTrips: 0,
      estimatedCost: 0,
      isValid: false,
      error: "Peso totale non può essere negativo"
    };
  }
  
  if (distance < 0) {
    return {
      totalWeight,
      distance: 0,
      vehicleCapacity,
      suggestedTrips: 0,
      estimatedCost: 0,
      isValid: false,
      error: "Distanza non può essere negativa"
    };
  }
  
  if (vehicleCapacity <= 0) {
    return {
      totalWeight,
      distance,
      vehicleCapacity: DEFAULT_VEHICLE_CAPACITY_KG,
      suggestedTrips: 0,
      estimatedCost: 0,
      isValid: false,
      error: "Capacità veicolo deve essere maggiore di zero"
    };
  }

  // Se peso è 0, nessun viaggio necessario
  if (totalWeight === 0) {
    return {
      totalWeight: 0,
      distance,
      vehicleCapacity,
      suggestedTrips: 0,
      estimatedCost: 0,
      isValid: true
    };
  }

  // Calcola numero viaggi (arrotondato per eccesso)
  const suggestedTrips = Math.max(1, Math.ceil(totalWeight / vehicleCapacity));
  
  // Costo stimato: (costo base + costo per km * distanza A/R) * numero viaggi
  // distanza * 2 = andata e ritorno
  const roundTripDistance = distance * 2;
  const costPerTrip = BASE_TRIP_COST + (COST_PER_KM * roundTripDistance);
  const estimatedCost = suggestedTrips * costPerTrip;
  
  return {
    totalWeight,
    distance,
    vehicleCapacity,
    suggestedTrips,
    estimatedCost: Math.round(estimatedCost * 100) / 100, // Arrotonda a 2 decimali
    isValid: true
  };
}

/**
 * Stima il peso in base alla superficie di ponteggio.
 * Utile per pre-calcolare il peso quando si conosce solo la metratura.
 * 
 * @param sqMeters - Superficie in metri quadrati (deve essere >= 0)
 * @returns Peso stimato in kg (0 se input non valido)
 */
export function estimateWeightFromArea(sqMeters: number): number {
  if (sqMeters < 0) return 0;
  const WEIGHT_PER_SQM = 50; // kg stimati per mq di ponteggio
  return sqMeters * WEIGHT_PER_SQM;
}
