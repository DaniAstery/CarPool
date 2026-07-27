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
        
        // 🛑 SAFETY GUARD: If database is cleared or returns no active status, bail out!
        if (!data || Object.keys(data).length === 0 || !data.status && !data.driver_status && !data.rideStatus) {
          return; 
        }

        const rawStatus = data.driver_status || data.rideStatus || data.status;
        if (!rawStatus) return; // Do not guess status if none exists

        const status = rawStatus.toLowerCase().trim();
        
        // Ignore dummy/cleared statuses
        if (["none", "cancelled", "inactive", "idle"].includes(status)) {
          return;
        }

        const rideOfferId = data.matched_ride_offer_id || data.ride_offer_id || data.id;
        const isDriver = userRole?.toLowerCase() === "driver";

        // For passengers, ensure 'pending' or 'proposal' actually has a backing ride or pool record
        if (!isDriver && ["pending", "proposal"].includes(status) && !rideOfferId && !data.pool && !data.passengers) {
          return; // Phantom pending state from an empty table -> ignore
        }

        const stateFingerprint = `${status}:${rideOfferId}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        // Ensure navigation container is ready before triggering route shifts
        if (!navigationRef.isReady()) return;

        // -------------------------------------------------------------
        // ROLE-AWARE ROUTING MATRIX
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
          timerId = setTimeout(evaluateGatewayRoute, 4000);
        }
      }
    }async function evaluateGatewayRoute() {
      if (!isSubscribed) return;

      try {
        const res = await fetch(`${API_BASE_URL}/rides/status/${userId}`);
        if (!res.ok || !isSubscribed) return;

        const data = await res.json();
        
        // 🛑 SAFETY GUARD: If database is cleared or returns no active status, bail out!
        if (!data || Object.keys(data).length === 0 || !data.status && !data.driver_status && !data.rideStatus) {
          return; 
        }

        const rawStatus = data.driver_status || data.rideStatus || data.status;
        if (!rawStatus) return; // Do not guess status if none exists

        const status = rawStatus.toLowerCase().trim();
        
        // Ignore dummy/cleared statuses
        if (["none", "cancelled", "inactive", "idle"].includes(status)) {
          return;
        }

        const rideOfferId = data.matched_ride_offer_id || data.ride_offer_id || data.id;
        const isDriver = userRole?.toLowerCase() === "driver";

        // For passengers, ensure 'pending' or 'proposal' actually has a backing ride or pool record
        if (!isDriver && ["pending", "proposal"].includes(status) && !rideOfferId && !data.pool && !data.passengers) {
          return; // Phantom pending state from an empty table -> ignore
        }

        const stateFingerprint = `${status}:${rideOfferId}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        // Ensure navigation container is ready before triggering route shifts
        if (!navigationRef.isReady()) return;

        // -------------------------------------------------------------
        // ROLE-AWARE ROUTING MATRIX
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
          timerId = setTimeout(evaluateGatewayRoute, 4000);
        }
      }
    }
    
    
   async function evaluateGatewayRoute() {
      if (!isSubscribed) return;

      try {
        const res = await fetch(`${API_BASE_URL}/rides/status/${userId}`);
        
        // 🛑 HANDLE CLEARED DATABASE / 404 / EMPTY POOL
        if (!res.ok || !isSubscribed) {
          // If the server says 404 or fails, clear state and route back to Home
          const stateFingerprint = "cleared:none";
          if (lastRoutedStateRef.current !== stateFingerprint && navigationRef.isReady()) {
            lastRoutedStateRef.current = stateFingerprint;
            navigationRef.navigate("Home"); // Change to your app's home/search screen name if different
          }
          return;
        }

        const data = await res.json();
        const rawStatus = data.driver_status || data.rideStatus || data.status;
        const status = rawStatus ? rawStatus.toLowerCase().trim() : "none";
        const rideOfferId = data.matched_ride_offer_id || data.ride_offer_id || data.id;
        const isDriver = userRole?.toLowerCase() === "driver";

        // 🛑 HANDLE EXPLICITLY CLEARED OR CANCELLED STATUSES
        if (["none", "cancelled", "inactive", "idle", "expired"].includes(status) || !rideOfferId && !data.pool && !data.passengers && !data.status) {
          const stateFingerprint = "cleared:none";
          if (lastRoutedStateRef.current !== stateFingerprint && navigationRef.isReady()) {
            lastRoutedStateRef.current = stateFingerprint;
            navigationRef.navigate("Home"); // Active bounce back to home
          }
          return;
        }

        const stateFingerprint = `${status}:${rideOfferId}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        if (!navigationRef.isReady()) return;

        // -------------------------------------------------------------
        // ROLE-AWARE ROUTING MATRIX
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
            case "matched":
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
          timerId = setTimeout(evaluateGatewayRoute, 4000);
        }
      }
    }async function evaluateGatewayRoute() {
      if (!isSubscribed) return;

      try {
        const res = await fetch(`${API_BASE_URL}/rides/status/${userId}`);
        
        // 🛑 HANDLE CLEARED DATABASE / 404 / EMPTY POOL
        if (!res.ok || !isSubscribed) {
          // If the server says 404 or fails, clear state and route back to Home
          const stateFingerprint = "cleared:none";
          if (lastRoutedStateRef.current !== stateFingerprint && navigationRef.isReady()) {
            lastRoutedStateRef.current = stateFingerprint;
            navigationRef.navigate("Home"); // Change to your app's home/search screen name if different
          }
          return;
        }

        const data = await res.json();
        const rawStatus = data.driver_status || data.rideStatus || data.status;
        const status = rawStatus ? rawStatus.toLowerCase().trim() : "none";
        const rideOfferId = data.matched_ride_offer_id || data.ride_offer_id || data.id;
        const isDriver = userRole?.toLowerCase() === "driver";

        // 🛑 HANDLE EXPLICITLY CLEARED OR CANCELLED STATUSES
        if (["none", "cancelled", "inactive", "idle", "expired"].includes(status) || !rideOfferId && !data.pool && !data.passengers && !data.status) {
          const stateFingerprint = "cleared:none";
          if (lastRoutedStateRef.current !== stateFingerprint && navigationRef.isReady()) {
            lastRoutedStateRef.current = stateFingerprint;
            navigationRef.navigate("Home"); // Active bounce back to home
          }
          return;
        }

        const stateFingerprint = `${status}:${rideOfferId}:${isDriver ? "driver" : "passenger"}`;
        if (lastRoutedStateRef.current === stateFingerprint) return;

        if (!navigationRef.isReady()) return;

        // -------------------------------------------------------------
        // ROLE-AWARE ROUTING MATRIX
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
            case "matched":
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
              navigationRef.navigate("TripDeparture", {
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
          timerId = setTimeout(evaluateGatewayRoute, 4000);
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