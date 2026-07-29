// src/hooks/useRideGateway.js
import { useEffect, useRef } from "react";

const API_BASE_URL = "http://192.168.63.52:5000/api";

export function useRideGateway({ userId, userRole, navigationRef, enabled = true }) {
  const lastRoutedStateRef = useRef(null);

  useEffect(() => {
    if (!enabled || !userId || !navigationRef) return;

    let isSubscribed = true;
    let timerId;

    async function evaluateGatewayRoute() {
      if (!isSubscribed) return;

      try {
        const normalizedRole = userRole?.toLowerCase().trim();
        const isDriver = normalizedRole === "driver";
        const roleParam = isDriver ? "driver" : "passenger";

        const res = await fetch(`${API_BASE_URL}/gateway/state/${userId}?role=${roleParam}`);
        if (!res.ok || !isSubscribed) return;

        const data = await res.json();
        if (!data || Object.keys(data).length === 0 || !data.status) return;

        const status = data.status.toLowerCase().trim();
        const rideOfferId = data.rideOfferId || data.matched_ride_offer_id || data.id;
        const sourceTable = data.source_table || "route_pool";
        const isAcceptedPassenger = Boolean(data.is_in_accepted_passengers);
        const poolCount = data.currentPoolCount || data.pool_count || 1;

        if (["none", "cancelled", "idle", "expired"].includes(status)) return;

        const stateFingerprint = `${sourceTable}:${status}:${rideOfferId}:${isAcceptedPassenger}:${poolCount}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        if (!navigationRef.isReady()) return;

        if (isDriver) {
          switch (status) {
            case "accepted":
            case "pending":
              if (rideOfferId) {
                lastRoutedStateRef.current = stateFingerprint;
                navigationRef.navigate("NavigateToPickup", { ride_offer_id: rideOfferId, rideId: rideOfferId });
              }
              break;
            case "arrived":
              if (rideOfferId) {
                lastRoutedStateRef.current = stateFingerprint;
                navigationRef.navigate("DriverArrivedScreen", { ride_offer_id: rideOfferId, rideId: rideOfferId });
              }
              break;
            case "in_trip":
            case "intransit":
              if (rideOfferId) {
                lastRoutedStateRef.current = stateFingerprint;
                navigationRef.navigate("TripInProgress", { rideOfferId });
              }
              break;
            case "completed":
            case "finished":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("TripCompletion", { userId, rideOfferId });
              break;
            default:
              break;
          }
        } else {
          // --- PASSENGER / RIDER RULE MATRIX ---

          // 🎯 CORE RULE: If ride_offer is pending AND route_pool is matched with >= 2 passengers -> Force PickupProposal
          const isPendingProposalMatch = 
            (status === "matched" || status === "pending" || sourceTable === "route_pool") && 
            rideOfferId !== null && 
            !isAcceptedPassenger;

          if (isPendingProposalMatch && poolCount >= 2) {
            lastRoutedStateRef.current = stateFingerprint;
            navigationRef.navigate("PickupProposal", { userId, rideOfferId });
            return;
          }

        

          switch (status) {
            case "searching":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("MatchingScreen", { userId, rideOfferId });
              break;

            case "matched":
            case "proposal":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("PickupProposal", { userId, rideOfferId });
              break;

            case "arrived":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("PickupProposal", { userId, rideOfferId });
              break;

            case "in_trip":
            case "intransit":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("TripDeparture", { userId, rideOfferId });
              break;

            case "completed":
            case "finished":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("TripCompletion", { userId, rideOfferId });
              break;

            default:
              break;
          }
        }
      } catch (err) {
        console.log("📍 [RideGateway] Route evaluation check error:", err.message);
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(evaluateGatewayRoute, 3500);
        }
      }
    }

    evaluateGatewayRoute();

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [userId, userRole, navigationRef, enabled]);
}