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
        const res = await fetch(`${API_BASE_URL}/rides/status/${userId}`);
        if (!res.ok || !isSubscribed) return;

        const data = await res.json();
        const rawStatus = data.driver_status || data.rideStatus || data.status || "pending";
        const status = rawStatus.toLowerCase().trim();
        const rideOfferId = data.matched_ride_offer_id || data.ride_offer_id || data.id;
        const isDriver = userRole?.toLowerCase() === "driver";

        const stateFingerprint = `${status}:${rideOfferId}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        // Ensure navigation container is ready before triggering route shifts
        if (!navigationRef.isReady()) return;

        // -------------------------------------------------------------
        // ROLE-AWARE ROUTING MATRIX (Matching your App.js route names)
        // -------------------------------------------------------------
        if (isDriver) {
          switch (status) {
            case "accepted":
            case "arrived":
              if (rideOfferId) {
                lastRoutedStateRef.current = stateFingerprint;
                navigationRef.navigate("NavigateToPickup", {
                  ride_offer_id: rideOfferId,
                  rideId: rideOfferId,
                });
              }
              break;

            case "in_trip":
            case "intransit":
              if (rideOfferId) {
                lastRoutedStateRef.current = stateFingerprint;
                navigationRef.navigate("TripInProgress", {
                  rideOfferId: rideOfferId,
                });
              }
              break;

            default:
              break;
          }
        } else {
          switch (status) {
            case "pending":
            case "proposal":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("PickupProposal", {
                userId: userId,
                rideOfferId: rideOfferId,
              });
              break;

            case "accepted":
            case "arrived":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("LiveTracking", {
                userId: userId,
                rideOfferId: rideOfferId,
              });
              break;

            case "in_trip":
            case "intransit":
              lastRoutedStateRef.current = stateFingerprint;
              navigationRef.navigate("TripInProgress", {
                rideOfferId: rideOfferId,
              });
              break;

            default:
              break;
          }
        }
      } catch (err) {
        console.log("📍 [RideGateway] Route evaluation non-fatal check failure:", err.message);
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(evaluateGatewayRoute, 4000); // Poll every 4s
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