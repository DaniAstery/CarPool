--
-- PostgreSQL database dump
--

\restrict 27zUXjSh015mlyJVfaK38ycd9tDOhjZ0NLWTZGHb90421ZxQpmSHhMxmvwlbSfa

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: auto_accept_manual_bookings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_accept_manual_bookings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If it's a manual booking and has been assigned a ride offer
    IF NEW.is_manual = true AND NEW.matched_ride_offer_id IS NOT NULL THEN
        
        -- Automatically promote status to 'accepted'
        IF NEW.status IN ('searching', 'matched') THEN
            NEW.status := 'accepted';
        END IF;

        -- Automatically append the user_id to the ride_offers accepted_passengers array
        UPDATE ride_offers
        SET accepted_passengers = array_append(accepted_passengers, NEW.user_id)
        WHERE id = NEW.matched_ride_offer_id
          AND NOT (NEW.user_id = ANY(accepted_passengers));
          
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_accept_manual_bookings() OWNER TO postgres;

--
-- Name: auto_calculate_route_base_price(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.auto_calculate_route_base_price() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_p_lat NUMERIC; v_p_lon NUMERIC;
  v_d_lat NUMERIC; v_d_lon NUMERIC;
  v_pickup_loc GEOGRAPHY; v_drop_loc GEOGRAPHY;

  v_dist_km NUMERIC := 0; 
  v_est_mins NUMERIC := 0;
  v_raw_fare NUMERIC;
  v_std_full_fare NUMERIC;

  -- Parameters mapped to your actual schema
  v_base_flag NUMERIC;
  v_rate_km NUMERIC;
  v_rate_min NUMERIC;
  v_min_fare NUMERIC;
  v_fuel_mult NUMERIC;
  v_surge_mult NUMERIC;
  v_mult_2pax NUMERIC;
  v_mult_3pax NUMERIC;
  v_mult_4pax NUMERIC;
BEGIN
  -- Select active rates using your exact column names
  SELECT 
    base_flag_down, rate_per_km, rate_per_minute, minimum_fare,
    fuel_multiplier, surge_multiplier,
    corridor_2pax_mult, corridor_3pax_mult, corridor_4pax_mult
  INTO 
    v_base_flag, v_rate_km, v_rate_min, v_min_fare,
    v_fuel_mult, v_surge_mult,
    v_mult_2pax, v_mult_3pax, v_mult_4pax
  FROM pricing_configs
  WHERE is_active = TRUE
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Fallback defaults
  v_base_flag  := COALESCE(v_base_flag, 130.00);
  v_rate_km    := COALESCE(v_rate_km, 28.00);
  v_rate_min   := COALESCE(v_rate_min, 2.50);
  v_min_fare   := COALESCE(v_min_fare, 160.00);
  v_fuel_mult  := COALESCE(v_fuel_mult, 1.00);
  v_surge_mult := COALESCE(v_surge_mult, 1.00);
  v_mult_2pax  := COALESCE(v_mult_2pax, 1.10);
  v_mult_3pax  := COALESCE(v_mult_3pax, 1.25);
  v_mult_4pax  := COALESCE(v_mult_4pax, 1.40);

  -- Fetch Hub Coordinates
  SELECT latitude, longitude INTO v_p_lat, v_p_lon FROM hubs WHERE id = NEW.pickup_hub_id;
  SELECT latitude, longitude INTO v_d_lat, v_d_lon FROM hubs WHERE id = NEW.drop_off_hub_id;

  IF v_p_lat IS NOT NULL AND v_p_lon IS NOT NULL AND v_d_lat IS NOT NULL AND v_d_lon IS NOT NULL THEN
    v_pickup_loc := ST_SetSRID(ST_MakePoint(v_p_lon, v_p_lat), 4326)::geography;
    v_drop_loc   := ST_SetSRID(ST_MakePoint(v_d_lon, v_d_lat), 4326)::geography;
    
    v_dist_km := (ST_Distance(v_pickup_loc, v_drop_loc) / 1000.0) * 1.35;
  END IF;

  -- Standard Solo Fare calculation
  v_est_mins := (v_dist_km / 22.0) * 60.0;
  v_raw_fare := (v_base_flag + (v_dist_km * v_rate_km) + (v_est_mins * v_rate_min)) * v_fuel_mult * v_surge_mult;
  v_std_full_fare := GREATEST(v_min_fare, v_raw_fare);
  
  NEW.standard_solo_fare := ROUND(v_std_full_fare / 10.0) * 10.0;

  -- Seat price tiers
  NEW.seat_price_2pax := GREATEST(50.00, ROUND(((v_std_full_fare * v_mult_2pax) / 2.0) / 10.0) * 10.0);
  NEW.seat_price_3pax := GREATEST(50.00, ROUND(((v_std_full_fare * v_mult_3pax) / 3.0) / 10.0) * 10.0);
  NEW.seat_price_4pax := GREATEST(50.00, ROUND(((v_std_full_fare * v_mult_4pax) / 4.0) / 10.0) * 10.0);

  -- Keep legacy recommended_base_price synchronized with 2-pax tier
  NEW.recommended_base_price := NEW.seat_price_2pax;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_calculate_route_base_price() OWNER TO postgres;

--
-- Name: handle_expired_ride_offer(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_expired_ride_offer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id INT;
    v_new_offer_id INT;
BEGIN
    -- Fire only when status is being set to 'expired'
    IF NEW.status = 'expired' AND OLD.status != 'expired' THEN
        
        -- 1. Migrate any previously accepted passengers to their new offers
        IF OLD.accepted_passengers IS NOT NULL AND cardinality(OLD.accepted_passengers) > 0 THEN
            
            FOR i IN 1..cardinality(OLD.accepted_passengers) LOOP
                v_user_id := OLD.accepted_passengers[i];
                
                -- Find their new matched_ride_offer_id assigned by the matching engine
                SELECT matched_ride_offer_id INTO v_new_offer_id
                FROM route_pool
                WHERE user_id = v_user_id 
                  AND matched_ride_offer_id IS NOT NULL 
                  AND matched_ride_offer_id != OLD.id
                LIMIT 1;
                
                IF v_new_offer_id IS NOT NULL THEN
                    -- Update route_pool status to 'accepted' for the new offer
                    UPDATE route_pool
                    SET status = 'accepted'
                    WHERE user_id = v_user_id AND matched_ride_offer_id = v_new_offer_id;
                    
                    -- Add the user to the new ride offer's accepted_passengers array (preventing duplicates)
                    UPDATE ride_offers
                    SET accepted_passengers = (
                        SELECT ARRAY(
                            SELECT DISTINCT e 
                            FROM unnest(COALESCE(accepted_passengers, ARRAY[]::INTEGER[]) || v_user_id) AS t(e)
                        )
                    )
                    WHERE id = v_new_offer_id;
                END IF;
            END LOOP;
            
        END IF;
        
        -- 2. Clear accepted passengers on this offer
        NEW.accepted_passengers := '{}';
        
        -- 3. Reset status back to 'pending' automatically. 
        -- Note: created_at is NOT touched, so original priority timestamp remains intact!
        NEW.status := 'pending';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.handle_expired_ride_offer() OWNER TO postgres;

--
-- Name: notify_driver_queue_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_driver_queue_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_hub_name TEXT;
  rec RECORD;
BEGIN
  rec := COALESCE(NEW, OLD);

  target_hub_name := rec.current_hub_name;

  -- Fallback via current_hub_id lookup
  IF target_hub_name IS NULL AND rec.current_hub_id IS NOT NULL THEN
    SELECT h.name INTO target_hub_name
    FROM hubs h
    WHERE h.id::text = rec.current_hub_id::text;
  END IF;

  -- Fallback via route_id lookup
  IF target_hub_name IS NULL AND rec.route_id IS NOT NULL THEN
    SELECT h.name INTO target_hub_name
    FROM routes r
    JOIN hubs h ON r.pickup_hub_id::text = h.id::text
    WHERE r.id::text = rec.route_id::text;
  END IF;

  IF target_hub_name IS NOT NULL THEN
    PERFORM pg_notify('hub_queue_changed', json_build_object(
      'hub_name', target_hub_name,
      'queue_id', rec.id,
      'driver_id', rec.driver_id,
      'status', rec.status,
      'route_id', rec.route_id
    )::text);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_driver_queue_change() OWNER TO postgres;

--
-- Name: notify_hub_queue_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_hub_queue_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_hub_name TEXT;
  target_start_loc INT;
  current_row RECORD;
BEGIN
  -- Handle both NEW (INSERT/UPDATE) and OLD (DELETE)
  current_row := COALESCE(NEW, OLD);
  target_start_loc := current_row.start_location::integer;

  -- Map start_location to hub name for socket room routing
  SELECT h.name INTO target_hub_name
  FROM hubs h
  WHERE h.id = target_start_loc;

  IF target_hub_name IS NOT NULL THEN
    PERFORM pg_notify('hub_queue_changed', json_build_object(
      'hub_name', target_hub_name,
      'ride_id', current_row.id,
      'available_seats', current_row.available_seats,
      'total_seats', current_row.total_seats,
      'status', current_row.status,
      'route_id', current_row.route_id
    )::text);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_hub_queue_change() OWNER TO postgres;

--
-- Name: notify_proposal_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_proposal_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Broadcasts the user_id or ride_offer_id as the payload
  PERFORM pg_notify('proposal_update', NEW.user_id::text);
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_proposal_change() OWNER TO postgres;

--
-- Name: notify_ride_offer_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_ride_offer_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_payload json;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_payload := json_build_object(
      'operation', TG_OP,
      'ride_offer_id', OLD.id,
      'route_id', OLD.route_id,
      'total_seats', OLD.total_seats,
      'available_seats', OLD.available_seats,
      'status', OLD.status
    );
    PERFORM pg_notify('route_pool_changed', v_payload::text);
    RETURN OLD;
  ELSE
    v_payload := json_build_object(
      'operation', TG_OP,
      'ride_offer_id', NEW.id,
      'route_id', NEW.route_id,
      'total_seats', NEW.total_seats,
      'available_seats', NEW.available_seats,
      'status', NEW.status
    );
    PERFORM pg_notify('route_pool_changed', v_payload::text);
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION public.notify_ride_offer_change() OWNER TO postgres;

--
-- Name: notify_ride_offers_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_ride_offers_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_hub_name TEXT;
  rec RECORD;
BEGIN
  rec := COALESCE(NEW, OLD);

  -- 1. Try resolving hub name directly via start_location
  IF rec.start_location IS NOT NULL THEN
    SELECT h.name INTO target_hub_name
    FROM hubs h
    WHERE h.id::text = rec.start_location::text;
  END IF;

  -- 2. Fallback via routes table lookup using route_id
  IF target_hub_name IS NULL AND rec.route_id IS NOT NULL THEN
    SELECT h.name INTO target_hub_name
    FROM routes r
    JOIN hubs h ON r.pickup_hub_id::text = h.id::text
    WHERE r.id::text = rec.route_id::text;
  END IF;

  IF target_hub_name IS NOT NULL THEN
    PERFORM pg_notify('hub_queue_changed', json_build_object(
      'hub_name', target_hub_name,
      'ride_id', rec.id,
      'available_seats', rec.available_seats,
      'total_seats', rec.total_seats,
      'status', rec.status,
      'route_id', rec.route_id
    )::text);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_ride_offers_change() OWNER TO postgres;

--
-- Name: notify_ride_status_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_ride_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    payload TEXT;
BEGIN
    IF (TG_TABLE_NAME = 'ride_offers') THEN
        payload := json_build_object(
            'ride_offer_id', NEW.id,
            'driver_status', NEW.status
        )::text;
    ELSIF (TG_TABLE_NAME = 'route_pool') THEN
        payload := json_build_object(
            'ride_offer_id', NEW.matched_ride_offer_id,
            'user_id', NEW.user_id,
            'passenger_status', NEW.status
        )::text;
    END IF;

    PERFORM pg_notify('ride_status_channel', payload);
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_ride_status_change() OWNER TO postgres;

--
-- Name: notify_route_pool_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_route_pool_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_route_id INT;
  payload JSON;
BEGIN
  -- 1. Identify which route was affected
  IF (TG_OP = 'DELETE') THEN
    target_route_id := OLD.route_id;
  ELSE
    target_route_id := NEW.route_id;
  END IF;

  IF target_route_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Aggregate active searching/matched riders and compute dynamic pricing safely
  WITH pool_stats AS (
    SELECT 
      rp.route_id,
      COUNT(CASE WHEN rp.status = 'searching' THEN 1 END)::int AS searching_pax,
      COUNT(CASE WHEN rp.status = 'matched' THEN 1 END)::int AS matched_pax,
      COUNT(CASE WHEN rp.status IN ('searching', 'matched') THEN 1 END)::int AS current_pax,
      MAX(CASE WHEN rp.status = 'matched' THEN rp.joined_at END) AS matched_at
    FROM route_pool rp
    WHERE rp.route_id = target_route_id AND rp.status IN ('searching', 'matched')
    GROUP BY rp.route_id
  )
  SELECT json_build_object(
    'route_id', target_route_id,
    'searching_pax', COALESCE(ps.searching_pax, 0),
    'matched_pax', COALESCE(ps.matched_pax, 0),
    'current_pax', COALESCE(ps.current_pax, 0),
    'status', CASE 
                WHEN COALESCE(ps.matched_pax, 0) > 0 THEN 'matched' 
                ELSE 'searching' 
              END,
    'matched_at', ps.matched_at,

    -- Safe Dynamic Price: Ignores 0 or NULL tier prices and falls back gracefully
    'price', CASE 
               WHEN COALESCE(ps.current_pax, 0) <= 1 THEN 
                 COALESCE(NULLIF(r.seat_price_2pax, 0), NULLIF(r.recommended_base_price, 0), 130.0)
               WHEN COALESCE(ps.current_pax, 0) = 2 THEN 
                 COALESCE(NULLIF(r.seat_price_3pax, 0), NULLIF(r.seat_price_2pax, 0), NULLIF(r.recommended_base_price, 0), 130.0)
               ELSE 
                 COALESCE(NULLIF(r.seat_price_4pax, 0), NULLIF(r.seat_price_3pax, 0), NULLIF(r.recommended_base_price, 0), 130.0)
             END
  ) INTO payload
  FROM routes r
  LEFT JOIN pool_stats ps ON ps.route_id = r.id
  WHERE r.id = target_route_id;

  -- 3. Broadcast notification payload over PostgreSQL channel
  IF payload IS NOT NULL THEN
    PERFORM pg_notify('route_pool_channel', payload::text);
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION public.notify_route_pool_change() OWNER TO postgres;

--
-- Name: notify_route_pool_match(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_route_pool_match() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_driver_id INT;
  v_payload JSON;
BEGIN
  -- Trigger when status is matched and attached to a ride offer
  IF (NEW.status = 'matched' AND NEW.matched_ride_offer_id IS NOT NULL) THEN

    -- Resolve driver_id from ride_offers
    SELECT driver_id INTO v_driver_id
    FROM ride_offers
    WHERE id = NEW.matched_ride_offer_id;

    -- Construct JSON payload
    v_payload := json_build_object(
      'event', 'RIDER_MATCHED',
      'route_pool_id', NEW.id,
      'route_id', NEW.route_id,
      'user_id', NEW.user_id,
      'driver_id', v_driver_id,
      'ride_offer_id', NEW.matched_ride_offer_id,
      'pickup_hub_id', NEW.pickup_hub_id,
      'dropoff_hub_id', NEW.dropoff_hub_id,
      'status', NEW.status
    );

    -- Emit notification over channel
    PERFORM pg_notify('route_pool_updates', v_payload::text);

  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_route_pool_match() OWNER TO postgres;

--
-- Name: propagate_pricing_config_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.propagate_pricing_config_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Touch all active routes to trigger recalculation
  UPDATE routes
  SET updated_at = NOW()
  WHERE is_active = TRUE;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.propagate_pricing_config_changes() OWNER TO postgres;

--
-- Name: sync_manual_from_driver_offer(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_manual_from_driver_offer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE route_pool
        SET status = NEW.status
        WHERE matched_ride_offer_id = NEW.id
          AND is_manual = true
          AND status NOT IN ('completed', 'cancelled');
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_manual_from_driver_offer() OWNER TO postgres;

--
-- Name: sync_manual_from_peer_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_manual_from_peer_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.matched_ride_offer_id IS NOT NULL THEN
        UPDATE route_pool
        SET status = NEW.status
        WHERE matched_ride_offer_id = NEW.matched_ride_offer_id
          AND is_manual = true
          AND status != NEW.status
          AND status NOT IN ('completed', 'cancelled');
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_manual_from_peer_status() OWNER TO postgres;

--
-- Name: trg_seed_driver_session(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_seed_driver_session() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_lat NUMERIC := 9.0192;
  v_lng NUMERIC := 38.7525;
BEGIN
  IF NEW.pickup_lat IS NOT NULL AND NEW.pickup_lng IS NOT NULL THEN
    v_lat := NEW.pickup_lat;
    v_lng := NEW.pickup_lng;
  ELSIF NEW.start_location ~ '^[0-9]+$' THEN
    SELECT latitude, longitude INTO v_lat, v_lng FROM hubs WHERE id = NEW.start_location::integer;
  END IF;

  INSERT INTO active_user_sessions (user_id, active_role, device_id, lat, lng, heading, status, last_ping_at)
  VALUES (NEW.driver_id, 'driver', 'system_auto', COALESCE(v_lat, 9.0192), COALESCE(v_lng, 38.7525), 0.0, 'online', NOW())
  ON CONFLICT (user_id) DO NOTHING; -- Leaves live GPS coordinates completely untouched

  RETURN NEW;
END;
$_$;


ALTER FUNCTION public.trg_seed_driver_session() OWNER TO postgres;

--
-- Name: trg_seed_passenger_session(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_seed_passenger_session() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lat NUMERIC := 9.0192;
  v_lng NUMERIC := 38.7525;
BEGIN
  IF NEW.pickup_hub_id IS NOT NULL THEN
    SELECT latitude, longitude INTO v_lat, v_lng FROM hubs WHERE id = NEW.pickup_hub_id;
  END IF;

  INSERT INTO active_user_sessions (user_id, active_role, device_id, lat, lng, heading, status, last_ping_at)
  VALUES (NEW.user_id, 'passenger', 'system_auto', COALESCE(v_lat, 9.0192), COALESCE(v_lng, 38.7525), 0.0, 'online', NOW())
  ON CONFLICT (user_id) DO NOTHING; -- Leaves live GPS coordinates completely untouched

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.trg_seed_passenger_session() OWNER TO postgres;

--
-- Name: update_ride_offer_accepted_passengers(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_ride_offer_accepted_passengers() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- When status becomes 'accepted' and is linked to a ride offer
    IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.matched_ride_offer_id IS NOT NULL THEN
        UPDATE ride_offers
        SET accepted_passengers = array_append(accepted_passengers, NEW.user_id)
        WHERE id = NEW.matched_ride_offer_id
          AND NOT (NEW.user_id = ANY(accepted_passengers));
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ride_offer_accepted_passengers() OWNER TO postgres;

--
-- Name: update_user_gps_throttled(integer, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_user_gps_throttled(p_user_id integer, p_lat numeric, p_lng numeric, p_heading numeric DEFAULT 0.0) RETURNS void
    LANGUAGE plpgsql
    AS $$
      DECLARE
        v_role VARCHAR(20);
      BEGIN
        SELECT active_role INTO v_role FROM active_user_sessions WHERE user_id = p_user_id;

        IF v_role IS NULL THEN
          IF EXISTS (SELECT 1 FROM route_pool WHERE user_id = p_user_id AND status != 'completed') THEN
            v_role := 'passenger';
          ELSIF EXISTS (SELECT 1 FROM ride_offers WHERE driver_id = p_user_id AND status != 'completed') THEN
            v_role := 'driver';
          ELSIF EXISTS (SELECT 1 FROM driver_queue WHERE driver_id = p_user_id AND exited_at IS NULL) THEN
            v_role := 'driver';
          ELSE
            SELECT COALESCE(role, 'passenger') INTO v_role FROM users WHERE id = p_user_id;
          END IF;
        END IF;

        INSERT INTO active_user_sessions (user_id, active_role, device_id, lat, lng, heading, status, last_ping_at)
        VALUES (p_user_id, COALESCE(v_role, 'passenger'), 'mobile_app', p_lat, p_lng, p_heading, 'online', NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET 
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          heading = EXCLUDED.heading,
          device_id = 'mobile_app',
          status = 'online',
          last_ping_at = NOW();
      END;
      $$;


ALTER FUNCTION public.update_user_gps_throttled(p_user_id integer, p_lat numeric, p_lng numeric, p_heading numeric) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.active_user_sessions (
    user_id integer NOT NULL,
    active_role character varying(20) NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    heading numeric(5,2) DEFAULT 0.0,
    status character varying(20) DEFAULT 'online'::character varying,
    last_ping_at timestamp with time zone DEFAULT now(),
    device_id character varying(255) DEFAULT 'system_auto'::character varying,
    CONSTRAINT active_user_sessions_active_role_check CHECK (((active_role)::text = ANY ((ARRAY['driver'::character varying, 'passenger'::character varying])::text[]))),
    CONSTRAINT active_user_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'en_route'::character varying, 'at_hub'::character varying, 'in_trip'::character varying])::text[])))
);


ALTER TABLE public.active_user_sessions OWNER TO postgres;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(150),
    role character varying(50) DEFAULT 'operations_admin'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.admin_users OWNER TO postgres;

--
-- Name: admin_users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_users_id_seq OWNER TO postgres;

--
-- Name: admin_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_users_id_seq OWNED BY public.admin_users.id;


--
-- Name: commissions_ledger; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.commissions_ledger (
    id integer NOT NULL,
    trip_id integer,
    driver_id integer,
    gross_fare numeric(10,2) NOT NULL,
    commission_amount numeric(10,2) NOT NULL,
    is_deducted boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.commissions_ledger OWNER TO postgres;

--
-- Name: commissions_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.commissions_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.commissions_ledger_id_seq OWNER TO postgres;

--
-- Name: commissions_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.commissions_ledger_id_seq OWNED BY public.commissions_ledger.id;


--
-- Name: driver_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.driver_profiles (
    driver_id integer NOT NULL,
    license_number character varying(50),
    bank_name character varying(100),
    bank_account_number character varying(100),
    telebirr_number character varying(50)
);


ALTER TABLE public.driver_profiles OWNER TO postgres;

--
-- Name: driver_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.driver_queue (
    id integer NOT NULL,
    driver_id integer NOT NULL,
    vehicle_id integer,
    route_id integer NOT NULL,
    current_hub_id integer NOT NULL,
    current_hub_name character varying(100),
    status character varying(20) DEFAULT 'queued'::character varying,
    capacity integer DEFAULT 4,
    entered_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    exited_at timestamp without time zone
);


ALTER TABLE public.driver_queue OWNER TO postgres;

--
-- Name: driver_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.driver_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.driver_queue_id_seq OWNER TO postgres;

--
-- Name: driver_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.driver_queue_id_seq OWNED BY public.driver_queue.id;


--
-- Name: hubs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hubs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL
);


ALTER TABLE public.hubs OWNER TO postgres;

--
-- Name: hubs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.hubs_id_seq OWNER TO postgres;

--
-- Name: hubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hubs_id_seq OWNED BY public.hubs.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_settings (
    key character varying(50) NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.platform_settings OWNER TO postgres;

--
-- Name: pricing_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pricing_configs (
    id integer NOT NULL,
    city_code character varying(50) DEFAULT 'ADDIS_ABABA'::character varying,
    base_flag_down numeric(10,2) DEFAULT 105.00 NOT NULL,
    rate_per_km numeric(10,2) DEFAULT 15.50 NOT NULL,
    rate_per_minute numeric(10,2) DEFAULT 1.50 NOT NULL,
    minimum_fare numeric(10,2) DEFAULT 120.00 NOT NULL,
    fuel_multiplier numeric(4,2) DEFAULT 1.00 NOT NULL,
    surge_multiplier numeric(4,2) DEFAULT 1.00 NOT NULL,
    is_active boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(100),
    platform_commission_rate numeric(5,4) DEFAULT 0.0500 NOT NULL,
    corridor_2pax_mult numeric DEFAULT 1.10,
    corridor_3pax_mult numeric DEFAULT 1.25,
    corridor_4pax_mult numeric DEFAULT 1.40
);


ALTER TABLE public.pricing_configs OWNER TO postgres;

--
-- Name: pricing_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pricing_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pricing_configs_id_seq OWNER TO postgres;

--
-- Name: pricing_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pricing_configs_id_seq OWNED BY public.pricing_configs.id;


--
-- Name: ride_offers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ride_offers (
    id integer NOT NULL,
    driver_id integer,
    vehicle_id integer,
    start_location character varying(255) NOT NULL,
    end_location character varying(255) NOT NULL,
    departure_time timestamp without time zone NOT NULL,
    total_seats integer NOT NULL,
    available_seats integer NOT NULL,
    price_per_seat numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    route_id integer,
    pickup_lat double precision,
    pickup_lng double precision,
    accepted_passengers integer[] DEFAULT '{}'::integer[],
    final_price numeric(10,2) DEFAULT 0.00
);


ALTER TABLE public.ride_offers OWNER TO postgres;

--
-- Name: COLUMN ride_offers.final_price; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.ride_offers.final_price IS 'The exact total revenue generated by all pooled passengers at trip conclusion.';


--
-- Name: ride_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ride_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ride_offers_id_seq OWNER TO postgres;

--
-- Name: ride_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ride_offers_id_seq OWNED BY public.ride_offers.id;


--
-- Name: ride_request_solo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ride_request_solo (
    id integer NOT NULL,
    user_id integer NOT NULL,
    driver_id integer,
    vehicle_id integer,
    hub_id integer,
    pickup_lat numeric NOT NULL,
    pickup_lng numeric NOT NULL,
    destination_lat numeric NOT NULL,
    destination_lng numeric NOT NULL,
    destination_name text,
    destination_address text,
    price numeric NOT NULL,
    distance_km numeric,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ride_request_solo OWNER TO postgres;

--
-- Name: ride_request_solo_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ride_request_solo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ride_request_solo_id_seq OWNER TO postgres;

--
-- Name: ride_request_solo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ride_request_solo_id_seq OWNED BY public.ride_request_solo.id;


--
-- Name: route_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.route_bookings (
    id integer NOT NULL,
    pool_id integer,
    user_id integer,
    pickup_point_id integer,
    status character varying(50) DEFAULT 'joined'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.route_bookings OWNER TO postgres;

--
-- Name: route_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.route_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.route_bookings_id_seq OWNER TO postgres;

--
-- Name: route_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.route_bookings_id_seq OWNED BY public.route_bookings.id;


--
-- Name: route_offers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.route_offers (
    id integer NOT NULL,
    driver_id integer NOT NULL,
    vehicle_id integer,
    start_location text,
    end_location text,
    departure_time timestamp without time zone,
    total_seats integer DEFAULT 3,
    available_seats integer DEFAULT 3,
    price_per_seat integer DEFAULT 100,
    pickup_lat double precision,
    pickup_lng double precision,
    filled integer DEFAULT 0,
    status text DEFAULT 'waiting'::text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.route_offers OWNER TO postgres;

--
-- Name: route_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.route_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.route_offers_id_seq OWNER TO postgres;

--
-- Name: route_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.route_offers_id_seq OWNED BY public.route_offers.id;


--
-- Name: route_pool; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.route_pool (
    id integer NOT NULL,
    route_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp without time zone DEFAULT now(),
    pickup_hub_id integer NOT NULL,
    dropoff_hub_id integer NOT NULL,
    status character varying(50) DEFAULT 'searching'::character varying,
    matched_ride_offer_id integer,
    is_manual boolean DEFAULT false
);


ALTER TABLE public.route_pool OWNER TO postgres;

--
-- Name: route_pool_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.route_pool_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.route_pool_id_seq OWNER TO postgres;

--
-- Name: route_pool_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.route_pool_id_seq OWNED BY public.route_pool.id;


--
-- Name: routes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.routes (
    id integer NOT NULL,
    hub_id integer,
    pickup_hub_id integer,
    drop_off_hub_id integer,
    pass_through_hub_id integer,
    recommended_base_price numeric NOT NULL,
    standard_solo_fare numeric,
    seat_price_2pax numeric,
    seat_price_3pax numeric,
    seat_price_4pax numeric,
    is_active boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.routes OWNER TO postgres;

--
-- Name: user_presence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_presence (
    id integer NOT NULL,
    user_id integer NOT NULL,
    user_type character varying(20) NOT NULL,
    is_online boolean DEFAULT false,
    latitude numeric(10,8),
    longitude numeric(11,8),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_presence_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['driver'::character varying, 'passenger'::character varying])::text[])))
);


ALTER TABLE public.user_presence OWNER TO postgres;

--
-- Name: user_presence_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_presence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_presence_id_seq OWNER TO postgres;

--
-- Name: user_presence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_presence_id_seq OWNED BY public.user_presence.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name character varying(100) NOT NULL,
    phone_number character varying(20),
    email character varying(100),
    role character varying(20) DEFAULT 'rider'::character varying,
    rating numeric(3,2) DEFAULT 5.00,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    profile_photo_url text DEFAULT 'https://placehold.co/150'::text,
    phone_verified boolean DEFAULT false,
    wallet_balance numeric(10,2) DEFAULT 0.00,
    is_suspended boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicles (
    id integer NOT NULL,
    driver_id integer,
    make character varying(50) NOT NULL,
    model character varying(50) NOT NULL,
    plate_number character varying(20) NOT NULL,
    color character varying(30),
    capacity integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vehicles OWNER TO postgres;

--
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vehicles_id_seq OWNER TO postgres;

--
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vehicles_id_seq OWNED BY public.vehicles.id;


--
-- Name: vw_active_dispatch_distances; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.vw_active_dispatch_distances AS
 SELECT aus.user_id,
    aus.active_role,
    aus.status,
    aus.lat AS current_lat,
    aus.lng AS current_lng,
    aus.last_ping_at,
    h.id AS hub_id,
    h.name AS hub_name,
    round((((6371)::double precision * acos(LEAST((1.0)::double precision, GREATEST(('-1.0'::numeric)::double precision, (((cos(radians((h.latitude)::double precision)) * cos(radians((aus.lat)::double precision))) * cos((radians((aus.lng)::double precision) - radians((h.longitude)::double precision)))) + (sin(radians((h.latitude)::double precision)) * sin(radians((aus.lat)::double precision)))))))))::numeric, 2) AS kms_from_pickup
   FROM ((((public.active_user_sessions aus
     LEFT JOIN public.route_pool rp ON (((aus.user_id = rp.user_id) AND ((aus.active_role)::text = 'passenger'::text))))
     LEFT JOIN public.ride_offers ro ON (((aus.user_id = ro.driver_id) AND ((aus.active_role)::text = 'driver'::text))))
     LEFT JOIN public.driver_queue dq ON (((aus.user_id = dq.driver_id) AND ((aus.active_role)::text = 'driver'::text) AND (dq.exited_at IS NULL))))
     LEFT JOIN public.hubs h ON ((h.id = COALESCE(rp.pickup_hub_id,
        CASE
            WHEN ((ro.start_location)::text ~ '^[0-9]+$'::text) THEN (ro.start_location)::integer
            ELSE NULL::integer
        END, dq.current_hub_id))));


ALTER VIEW public.vw_active_dispatch_distances OWNER TO postgres;

--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_transactions (
    id integer NOT NULL,
    user_id integer,
    amount numeric(10,2) NOT NULL,
    gateway character varying(30) NOT NULL,
    order_id character varying(50) NOT NULL,
    transaction_ref character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.wallet_transactions OWNER TO postgres;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallet_transactions_id_seq OWNER TO postgres;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: admin_users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_users ALTER COLUMN id SET DEFAULT nextval('public.admin_users_id_seq'::regclass);


--
-- Name: commissions_ledger id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commissions_ledger ALTER COLUMN id SET DEFAULT nextval('public.commissions_ledger_id_seq'::regclass);


--
-- Name: driver_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_queue ALTER COLUMN id SET DEFAULT nextval('public.driver_queue_id_seq'::regclass);


--
-- Name: hubs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hubs ALTER COLUMN id SET DEFAULT nextval('public.hubs_id_seq'::regclass);


--
-- Name: pricing_configs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_configs ALTER COLUMN id SET DEFAULT nextval('public.pricing_configs_id_seq'::regclass);


--
-- Name: ride_offers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_offers ALTER COLUMN id SET DEFAULT nextval('public.ride_offers_id_seq'::regclass);


--
-- Name: ride_request_solo id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_request_solo ALTER COLUMN id SET DEFAULT nextval('public.ride_request_solo_id_seq'::regclass);


--
-- Name: route_bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_bookings ALTER COLUMN id SET DEFAULT nextval('public.route_bookings_id_seq'::regclass);


--
-- Name: route_offers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_offers ALTER COLUMN id SET DEFAULT nextval('public.route_offers_id_seq'::regclass);


--
-- Name: route_pool id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_pool ALTER COLUMN id SET DEFAULT nextval('public.route_pool_id_seq'::regclass);


--
-- Name: user_presence id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_presence ALTER COLUMN id SET DEFAULT nextval('public.user_presence_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vehicles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN id SET DEFAULT nextval('public.vehicles_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Data for Name: active_user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.active_user_sessions (user_id, active_role, lat, lng, heading, status, last_ping_at, device_id) FROM stdin;
33	driver	9.0420229	38.8741750	272.40	online	2026-09-17 15:52:39.205255+03	device_droid_101
36	driver	9.0380000	38.8700000	135.00	online	2026-08-19 20:25:31.494137+03	device_ios_102
27	passenger	9.0423850	38.8774560	0.00	online	2026-08-25 12:40:28.78178+03	system_auto
34	passenger	9.0423850	38.8774560	0.00	online	2026-08-25 13:00:23.678317+03	system_auto
39	passenger	9.0423850	38.8774560	0.00	online	2026-08-25 13:22:16.639652+03	system_auto
40	passenger	9.0423850	38.8774560	0.00	online	2026-08-25 17:56:40.864012+03	system_auto
35	passenger	9.0423850	38.8774560	0.00	online	2026-08-25 19:59:42.174074+03	system_auto
\.


--
-- Data for Name: admin_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_users (id, username, password_hash, full_name, role, is_active, created_at) FROM stdin;
1	admin	D@ny_4567	Master Administrator	super_admin	t	2026-09-09 10:19:05.223354
\.


--
-- Data for Name: commissions_ledger; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.commissions_ledger (id, trip_id, driver_id, gross_fare, commission_amount, is_deducted, created_at) FROM stdin;
\.


--
-- Data for Name: driver_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.driver_profiles (driver_id, license_number, bank_name, bank_account_number, telebirr_number) FROM stdin;
33	LIC-ADDIS-9984	Commercial Bank of Ethiopia (CBE)	1000847291024	251998476704
\.


--
-- Data for Name: driver_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.driver_queue (id, driver_id, vehicle_id, route_id, current_hub_id, current_hub_name, status, capacity, entered_at, exited_at) FROM stdin;
\.


--
-- Data for Name: hubs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.hubs (id, name, latitude, longitude) FROM stdin;
14	Bole-Bulbula Extension - BL_03_629 Street	8.99779000	38.77721000
15	Bole-Bulbula Extension - BL_03_592 Street.	8.99822000	38.77842000
16	Bole-Bulbula Extension - ሩዋንዳ / Rwanda	8.99666000	38.77884000
17	Bole-Bulbula Extension - Cape Verde Street	8.99569000	38.77858000
18	Bole-Bulbula Extension - Rwanda Street	8.99014000	38.77848000
19	Bole-Bulbula Extension - ቦሌ ሚካኤል አካባቢ	8.98548000	38.77404000
20	Bole-Bulbula Extension - Balcha Street	8.97512000	38.77232000
46	ካዛንቺስ (Kazanchis-Bole)	9.01644000	38.77608000
47	አዋሬ Aware (Kazanchis-Bole)	9.01741000	38.77580000
48	Etsegenet Sook (Zewditu Street) (Kazanchis-Bole)	9.01686000	38.77331000
49	Zewditu Street (Kazanchis-Bole)	9.01467000	38.77309000
50	Ghana Street (Kazanchis-Bole)	9.00984000	38.77509000
51	Namibia Avenue (Kazanchis-Bole)	9.00328000	38.78059000
52	Mo Habib Dawud (Namibia Avenue) (Kazanchis-Bole)	9.00068000	38.78305000
53	Gebiru Minimarket (Namibia Avenue) (Kazanchis-Bole)	8.99860000	38.78581000
54	ግሂሊፍፋለግን ምንጭ (Kazanchis-Bole)	8.99776000	38.78666000
55	Hello mekina (Cameroon Street) (Kazanchis-Bole)	8.99592000	38.78844000
56	BL_03_682 Street (Kazanchis-Bole)	8.99432000	38.78994000
57	Cameroon Street (Kazanchis-Bole)	8.99328000	38.79095000
58	Münch German Bakery (Cameroon Street) (Kazanchis-Bole)	8.99110000	38.79254000
59	ቦሌ (Kazanchis-Bole)	8.98962000	38.79364000
60	ገርጂ አካባቢ (Kazanchis-Bole)	8.98530000	38.80454000
61	Road to Gergi Giorgis (Kazanchis-Bole)	8.98614000	38.80907000
9	Ring Road	8.98585000	38.79239000
5	ኦሎምፒያ	9.00008000	38.77031000
6	አፍሪካ ጎዳና	8.98851000	38.78992000
7	Africa-China Cooperation Square	8.98732000	38.79109000
8	Ethiopian Airports Enterprise Headquarters (Africa-China Cooperation Square)	8.98673000	38.79211000
10	BL_02_391 St.	8.98468000	38.79334000
11	BL_02_359 St	8.98447000	38.79406000
12	Phares Mobile & Accessories (Africa-China Cooperation Square)	8.98389000	38.79544000
13	HL Trading (Africa-China Cooperation Square)	8.98410000	38.79622000
21	Fikre Mariam Aba Techan Street	9.02045000	38.80239000
22	መገናኛ	9.02087000	38.80175000
23	አድዋ አደባባይ	9.01997000	38.80176000
24	Adwa Square	9.01980000	38.80131000
25	YK_13_0605 Street	9.02164000	38.83086000
26	የካ ቦሌ ቦታ	9.02171000	38.83206000
27	Mesi grocery (YK_13_0605 Street)	9.02160000	38.83493000
28	ድጃዝማች አሉላ እርሻ	9.02055000	38.85291000
29	ቦሌ አያት	9.02143000	38.87637000
30	ኮተቤ	9.03094000	38.83234000
31	Ararat to Kara	9.02821000	38.83222000
32	Jacros	9.02563000	38.82655000
33	መገናኛ	9.01923000	38.81965000
34	የካ ቦሌ ቦታ	9.01589000	38.87193000
35	ቦሌ አያት	9.02159000	38.87901000
36	ድጃዝማች አሉላ እርሻ	9.02138000	38.87393000
37	ካራ - Kara	9.06007000	38.87247000
38	Fikre Mariam Aba Techan Street	9.05757000	38.87416000
39	ካራ አሎ	9.03749000	38.85365000
40	ስንሻይን ሪል ስቴት	9.03546000	38.85352000
41	አያት	9.03083000	38.85250000
42	ድጃዝማች አሉላ እርሻ	9.02138000	38.85186000
43	YK_13_0605 Street	9.02103000	38.85122000
44	ኮተቤ	9.02119000	38.82898000
45	መገናኛ	9.01919000	38.81989000
62	መሿለኪያ / Meshuwalekiya	9.01101000	38.76116000
63	AB056T1A01	9.01083000	38.76275000
64	Africa Avenue / Bole Road	9.00858000	38.76479000
65	Olympia square	9.00438000	38.76801000
66	Greece Orthodox Church (Haile Selassie Street)	9.03718000	38.75514000
67	Haile Selassie Street	9.03796000	38.75558000
68	Hailu Kebede Street	9.03945000	38.75564000
69	Hailesilase Street	9.03981000	38.75612000
70	AR_06_1104 Street. / Tenagnework Street	9.03978000	38.75662000
71	ጊዮርጊስ	9.04537000	38.75562000
72	AR_06_1084 St. / Tewodros Av	9.04355000	38.76102000
73	Russia Av	9.04372000	38.76156000
74	Algeria Avenue	9.04413000	38.76132000
75	Algeria Av	9.04648000	38.76162000
76	Meyazia 27 Square	9.03307000	38.76329000
77	ኒጀር መንገድ	9.03262000	38.76331000
78	Queen Elizabeth Street	9.03243000	38.76425000
79	ኣቡሽ ጋራጅ (Queen Elizabeth Street)	9.03165000	38.77191000
80	Dejezamach Wolde Gebriel Street	9.03237000	38.77347000
81	አራት ኪሎ	9.03467000	38.77729000
82	Comoros Street	9.03456000	38.77815000
83	ሚሞሳ ኢትዮጵያ አስጎብኚ ድርጅት (Comoros Street)	9.03374000	38.78073000
84	Fikre Mariam Aba Techan Street	9.02860000	38.78909000
85	መገናኛ	9.02175000	38.80059000
86	Adwa Square	9.01980000	38.80131000
87	አድዋ አደባባይ	9.01927000	38.80199000
88	Ring Road	9.02067000	38.80164000
89	አሜሪካን ጊቢ	9.03301000	38.73799000
90	ሸማ ተራ	9.03194000	38.73668000
91	ሰባተኛ	9.03136000	38.73582000
92	Kenya Street	9.02919000	38.73356000
93	Congo Street	9.02899000	38.73265000
94	woreda 2 youth center (Congo Street)	9.02859000	38.72938000
95	አማኑኤል አካባቢ	9.02788000	38.72301000
96	ወረዳ ፫	9.02739000	38.72010000
97	To St. Emanuel Cherch	9.02852000	38.71789000
98	ሊደታ ገብሬል በተ ክሪስቲያን	9.02933000	38.71496000
99	Ring Road	9.03366000	38.71461000
100	New Ambo Road	9.03330000	38.70765000
101	አሜሪካን ጊቢ	9.03301000	38.73799000
102	ሸማ ተራ	9.03194000	38.73668000
103	ሰባተኛ	9.03136000	38.73582000
104	Kenya Street	9.02919000	38.73356000
105	Dej. Mekonin Demisaw	9.02714000	38.73312000
106	አዲስ ከተማ አካባቢ	9.02493000	38.73337000
107	Abnet Square	9.02037000	38.73292000
108	Dejazmach Balcha Aba Nefso Street	9.01974000	38.73285000
109	ኮካ ኮላ	9.01660000	38.72994000
110	Smuts Av	9.01222000	38.72858000
111	የጦር ሃይሎች ኮምፕርሄንሲቭ ስፔሻላይዝድ ሆስፒታል |  Armed Forces Comprehensive Specialized Hospital (Chad Street)	9.01151000	38.72286000
112	Algeria Av	9.04649000	38.76150000
113	Intoto Road	9.06189000	38.76137000
114	Entoto Road	9.06298000	38.76124000
115	Entoto Road	9.06271000	38.76127000
116	Shiromeda-ሽሮሜዳ	9.06140000	38.76156000
117	Algeria Av	9.06035000	38.76194000
118	Algeria Avenue	9.04431000	38.76123000
119	ስድስት ኪሎ	9.04393000	38.76092000
120	Weatherall Street	9.04398000	38.75990000
121	AR_06_1104 Street. / Tenagnework Street	9.04331000	38.75572000
122	Saba dereja	9.04047000	38.75670000
123	Hailesilase Street	9.03966000	38.75654000
124	Haile Selassie Street	9.03922000	38.75560000
125	Greece Orthodox Church (Haile Selassie Street)	9.03723000	38.75527000
126	ልደታ Lideta	9.00639000	38.73159000
140	ኮካ ኮላ	9.01885000	38.72662000
141	Dejazmach Balcha Aba Nefso Street	9.01648000	38.72982000
142	Abnet Square	9.02017000	38.73361000
143	Uganda Street	9.02086000	38.73378000
144	Sao Tome & Principe Street	9.02260000	38.73548000
145	በርበሬ ተራ	9.02492000	38.73835000
146	Nuredin Mini Mark (Uganda Street)	9.02617000	38.74018000
147	Oilibya (Uganda Street)	9.02707000	38.74139000
148	Arbegnoch Square	9.02842000	38.74313000
149	Tesema Aba Kemaw Street	9.02818000	38.74359000
150	Gobena Aba Tigu Street	9.02855000	38.74385000
151	Shoa Supermarket (Wawel Street)	9.03201000	38.74747000
152	ሶማሌ ተራ	9.03262000	38.74804000
153	Arbegnoch Street	9.03456000	38.75013000
154	Viale Benito Mussolini	9.03529000	38.74982000
155	ጊዮርጊስ	9.03637000	38.75242000
156	Hailu Kebede Street	9.03766000	38.75242000
157	Benin Street	9.03905000	38.75294000
158	AR_06_1084 St. / Tewodros Av	9.04355000	38.76102000
159	Russia Av	9.04367000	38.76154000
160	አራት ኪሎ	9.04340000	38.76248000
161	AR_06_1011 St.	9.04183000	38.76600000
162	General Mulugeta Buli Street	9.03885000	38.77343000
163	Menilik II Referral Hospital (Russia Av)	9.03927000	38.77456000
164	ሐና	8.93416000	38.74246000
165	NL_12_3097 Street	8.93644000	38.74373000
166	Lebu Mebrathayil	8.93768000	38.73403000
167	Hachalu Hundessa Road	8.93773000	38.73295000
168	ርቱ ቦታ	8.95433000	38.69757000
169	ጀሞ	8.95568000	38.69858000
170	Addis Ababa City Road Authority (Roosevelt Street)	8.99568000	38.73910000
171	Roosevelt Street	8.99641000	38.73927000
172	በግ ተራ	8.99698000	38.73974000
173	ቡልጋሪያ	8.99605000	38.73997000
174	Alexander Pushkin Avenue	8.99392000	38.73919000
175	Alexander Pushkin	8.99469000	38.73893000
176	ቄራ	8.98701000	38.74582000
177	Dej Beyene Merid Street	8.98180000	38.75719000
178	ጎተራ	8.98041000	38.75875000
179	Debre Zeit Road	8.97595000	38.75992000
180	ሳሪስ አቦ አካባቢ / Saris Abo Area	8.93472000	38.76513000
181	A1	8.93194000	38.76691000
182	ቃበና	8.89654000	38.77114000
183	4	8.89137000	38.77619000
184	አቃቂ ቃሊቲ / Akaki Kaliti Factory	8.88921000	38.78362000
185	ለቡ	8.96252000	38.72603000
186	ግሬት አካቺ	8.96536000	38.72739000
187	Ring Road	8.96461000	38.73128000
188	Guinea-Bissau street	8.96463000	38.73296000
189	መካኒሳ ኣቦ	8.97552000	38.73379000
190	Lesotho Street	8.98244000	38.73307000
191	ቫቲካን	8.98788000	38.73198000
192	Cape Verde Street	8.99601000	38.77866000
193	ሩዋንዳ / Rwanda	8.99299000	38.77874000
194	Rwanda Street	8.99005000	38.77841000
195	ቦሌ ሚካኤል አካባቢ	8.98015000	38.77290000
196	Ring Road	8.97949000	38.77140000
197	ሳሪስ አቦ አካባቢ / Saris Abo Area	8.93501000	38.76579000
198	A1	8.93386000	38.76544000
199	MA Transport & Logistics technology PLC (A1)	8.92009000	38.76355000
200	ቃበና	8.89464000	38.77296000
201	4	8.89106000	38.77529000
202	አቃቂ ቃሊቲ / Akaki Kaliti Factory	8.88923000	38.78363000
203	አቃቂ ቃሊቲ / Akaki Kaliti Factory	8.90048000	38.81704000
204	4	8.86020000	38.81630000
205	A1	8.85542000	38.80342000
206	4	8.85780000	38.81245000
207	Addis-Adama Expressway	8.86071000	38.81994000
208	አቃቂ ቃሊቲ / Akaki Kaliti Factory	8.87978000	38.81768000
209	ሳሪስ አቦ አካባቢ / Saris Abo Area	8.91931000	38.79803000
210	Ring Road	8.93910000	38.77134000
211	Debre Zeit Road	8.94463000	38.76651000
212	አዲስ / Adiss	8.94828000	38.76595000
213	አንድ አገልግሎት ማዕከል ህንፃ (ቂሊንጦ የኢንዱስትሪ ፓርክ) (4)	8.90463000	38.81556000
214	አቃቂ ቃሊቲ / Akaki Kaliti Factory	8.90418000	38.81497000
215	ሳሪስ አቦ አካባቢ / Saris Abo Area	8.92000000	38.79783000
216	Ring Road	8.93882000	38.77123000
217	ቦሌ ሚካኤል አካባቢ	8.97977000	38.77249000
218	Rwanda Street	8.98258000	38.77374000
219	ሩዋንዳ / Rwanda	8.98728000	38.77579000
220	BL_02_376 Street	8.99003000	38.77846000
221	Cape Verde Street	8.99428000	38.77858000
1	መሿለኪያ / Meshuwalekiya	9.01101000	38.76116000
2	AB056T1A01	9.01083000	38.76275000
3	Africa Avenue / Bole Road	9.00858000	38.76479000
4	Olympia square	9.00438000	38.76801000
127	ዳርማር	9.00733000	38.73195000
128	Chad Street	9.01140000	38.73444000
129	ልደታ Lideta	9.01187000	38.73760000
130	Chad Street	9.01133000	38.73655000
131	ዳርማር	9.01174000	38.73404000
132	Smuts Av	9.01184000	38.73236000
133	የጦር ሃይሎች ኮምፕርሄንሲቭ ስፔሻላይዝድ ሆስፒታል |  Armed Forces Comprehensive Specialized Hospital (Chad Street)	9.01151000	38.72286000
134	ቀጠና ሁለት	9.01180000	38.72179000
135	ኮልፌ ቀራኒዮ	9.01552000	38.71991000
136	LD_02_0225 Street	9.01659000	38.72063000
137	LD_02_0232 Street	9.01718000	38.72138000
138	LD_02_0219 Street	9.01765000	38.72199000
139	አማኑኤል አካባቢ	9.02008000	38.72273000
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.platform_settings (key, value, updated_at) FROM stdin;
is_commission_active	false	2026-09-09 10:04:03.121536
commission_rate	0.10	2026-09-09 10:04:03.127698
\.


--
-- Data for Name: pricing_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pricing_configs (id, city_code, base_flag_down, rate_per_km, rate_per_minute, minimum_fare, fuel_multiplier, surge_multiplier, is_active, updated_at, updated_by, platform_commission_rate, corridor_2pax_mult, corridor_3pax_mult, corridor_4pax_mult) FROM stdin;
1	ADDIS_ABABA	130.00	28.00	2.50	160.00	1.00	1.00	t	2026-08-22 14:34:40.060466	ADMIN_STRATEGY	0.0500	1.10	1.25	1.40
\.


--
-- Data for Name: ride_offers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ride_offers (id, driver_id, vehicle_id, start_location, end_location, departure_time, total_seats, available_seats, price_per_seat, status, created_at, route_id, pickup_lat, pickup_lng, accepted_passengers, final_price) FROM stdin;
\.


--
-- Data for Name: ride_request_solo; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ride_request_solo (id, user_id, driver_id, vehicle_id, hub_id, pickup_lat, pickup_lng, destination_lat, destination_lng, destination_name, destination_address, price, distance_km, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: route_bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.route_bookings (id, pool_id, user_id, pickup_point_id, status, created_at) FROM stdin;
\.


--
-- Data for Name: route_offers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.route_offers (id, driver_id, vehicle_id, start_location, end_location, departure_time, total_seats, available_seats, price_per_seat, pickup_lat, pickup_lng, filled, status, created_at) FROM stdin;
2	2	102	Piassa	CMC	2026-06-13 22:06:18.31841	3	3	120	9.01	38.75	0	waiting	2026-06-13 22:06:18.31841
3	3	103	Mexico	Bole	2026-06-13 22:06:18.31841	4	4	150	9.02	38.76	0	waiting	2026-06-13 22:06:18.31841
1	1	101	Megenagna	Bole	2026-06-13 22:06:18.31841	3	0	100	9.03	38.8	3	ready_to_depart	2026-06-13 22:06:18.31841
4	99	999	Megenagna	Bole	2026-06-13 22:32:51.055065	25	3	80	9.03	38.8	22	waiting	2026-06-13 22:32:51.055065
\.


--
-- Data for Name: route_pool; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.route_pool (id, route_id, user_id, joined_at, pickup_hub_id, dropoff_hub_id, status, matched_ride_offer_id, is_manual) FROM stdin;
\.


--
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.routes (id, hub_id, pickup_hub_id, drop_off_hub_id, pass_through_hub_id, recommended_base_price, standard_solo_fare, seat_price_2pax, seat_price_3pax, seat_price_4pax, is_active, updated_at) FROM stdin;
1	1	1	65	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
2	1	1	4	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
3	1	1	5	65	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
4	1	1	14	65	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
5	1	1	15	65	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
6	2	2	4	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
7	2	2	65	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
8	2	2	5	4	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
9	2	2	14	4	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
10	2	2	15	4	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
11	3	3	4	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
12	3	3	65	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
13	3	3	5	4	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
14	3	3	14	4	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
15	3	3	15	4	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
16	4	4	5	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
17	4	4	3	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
18	4	4	64	5	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
19	4	4	63	5	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
20	4	4	2	5	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
21	5	5	65	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
22	5	5	4	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
23	5	5	14	65	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
24	5	5	15	65	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
25	5	5	16	65	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
26	6	6	10	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
27	6	6	11	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
28	6	6	18	10	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
29	6	6	220	10	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
30	6	6	194	10	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
31	7	7	220	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
32	7	7	18	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
33	7	7	194	220	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
34	7	7	193	220	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
35	7	7	221	220	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
36	8	8	13	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
37	9	9	220	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
38	9	9	18	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
39	9	9	194	220	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
40	9	9	193	220	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
41	9	9	221	220	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
42	10	10	6	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
43	10	10	220	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
44	10	10	18	6	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
45	10	10	194	6	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
46	10	10	193	6	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
47	11	11	6	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
48	11	11	220	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
49	11	11	18	6	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
50	11	11	194	6	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
51	11	11	193	6	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
52	13	13	8	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
53	14	14	193	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
54	14	14	5	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
55	14	14	18	193	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
56	14	14	194	193	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
57	14	14	220	193	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
58	15	15	193	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
59	15	15	18	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
60	15	15	194	193	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
61	15	15	220	193	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
62	15	15	5	193	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
63	16	16	18	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
64	16	16	194	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
65	16	16	220	18	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
66	16	16	5	18	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
67	16	16	219	18	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
68	17	17	18	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
69	17	17	194	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
70	17	17	220	18	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
71	17	17	219	18	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
72	17	17	5	18	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
73	18	18	17	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
74	18	18	192	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
75	18	18	19	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
76	18	18	16	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
77	18	18	14	17	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
78	19	19	195	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
79	19	19	217	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
80	19	19	194	195	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
81	19	19	220	195	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
82	19	19	18	195	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
83	20	20	217	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
84	20	20	195	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
85	20	20	218	217	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
86	20	20	19	217	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
87	20	20	179	217	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
88	21	21	84	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
89	21	21	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
90	21	21	45	84	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
91	21	21	32	84	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
92	21	21	44	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
93	22	22	84	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
94	22	22	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
95	22	22	45	84	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
96	22	22	32	84	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
97	22	22	44	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
98	23	23	84	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
99	23	23	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
100	23	23	45	84	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
101	23	23	32	84	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
102	23	23	44	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
103	24	24	84	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
104	24	24	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
105	24	24	45	84	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
106	24	24	32	84	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
107	24	24	82	84	150.0	270.0	150.0	110.0	100.0	t	2026-10-12 12:00:55.691554+03
108	25	25	32	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
109	25	25	31	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
110	25	25	30	32	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
111	25	25	45	32	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
112	25	25	33	32	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
113	26	26	31	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
114	26	26	32	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
115	26	26	30	31	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
116	26	26	45	31	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
117	26	26	33	31	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
118	28	28	41	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
119	28	28	40	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
120	28	28	39	41	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
121	28	28	34	41	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
122	28	28	26	41	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
123	29	29	34	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
124	29	29	28	\N	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
125	29	29	42	34	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
126	29	29	43	34	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
127	29	29	41	34	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
128	30	30	32	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
129	30	30	26	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
130	30	30	25	32	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
131	30	30	44	32	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
132	30	30	45	32	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
133	31	31	32	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
134	31	31	26	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
135	31	31	25	32	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
136	31	31	44	32	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
137	31	31	45	32	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
138	32	32	44	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
139	32	32	25	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
140	32	32	31	44	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
141	32	32	26	44	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
142	32	32	30	44	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
143	33	33	32	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
144	33	33	44	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
145	33	33	25	32	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
146	33	33	26	32	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
147	33	33	31	32	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
148	34	34	36	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
149	34	34	29	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
150	34	34	35	36	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
151	34	34	28	36	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
152	34	34	42	36	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
153	35	35	36	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
154	35	35	34	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
155	35	35	28	36	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
156	35	35	42	36	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
157	35	35	43	36	150.0	270.0	150.0	110.0	100.0	t	2026-10-12 12:00:55.691554+03
158	36	36	35	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
159	36	36	34	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
160	36	36	28	35	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
161	36	36	42	35	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
162	36	36	43	35	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
163	37	37	39	\N	160.0	280.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
164	37	37	40	\N	160.0	290.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
165	37	37	41	39	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
166	37	37	36	39	180.0	330.0	180.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
167	37	37	29	39	180.0	330.0	180.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
168	38	38	39	\N	150.0	280.0	150.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
169	38	38	40	\N	160.0	290.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
170	38	38	41	39	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
171	38	38	36	39	170.0	320.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
172	38	38	29	39	180.0	320.0	180.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
173	39	39	41	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
174	39	39	42	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
175	39	39	43	41	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
176	39	39	28	41	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
177	39	39	30	41	130.0	250.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
178	40	40	41	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
179	40	40	42	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
180	40	40	43	41	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
181	40	40	28	41	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
182	40	40	30	41	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
183	41	41	40	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
184	41	41	39	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
185	41	41	42	40	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
186	41	41	43	40	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
187	41	41	28	40	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
188	42	42	41	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
189	42	42	40	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
190	42	42	39	41	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
191	42	42	26	41	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
192	42	42	31	41	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
193	43	43	41	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
194	43	43	40	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
195	43	43	39	41	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
196	43	43	26	41	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
197	43	43	31	41	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
198	44	44	32	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
199	44	44	31	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
200	44	44	45	32	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
201	44	44	33	32	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
202	44	44	30	32	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
203	45	45	44	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
204	45	45	32	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
205	45	45	25	44	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
206	45	45	26	44	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
207	45	45	31	44	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
208	46	46	50	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
209	46	46	51	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
210	46	46	52	50	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
211	46	46	53	50	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
212	46	46	54	50	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
213	47	47	50	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
214	47	47	51	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
215	47	47	52	50	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
216	47	47	53	50	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
217	47	47	54	50	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
218	48	48	50	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
219	48	48	51	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
220	48	48	52	50	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
221	48	48	53	50	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
222	48	48	54	50	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
223	49	49	50	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
224	49	49	51	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
225	49	49	52	50	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
226	49	49	53	50	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
227	49	49	54	50	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
228	50	50	49	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
229	50	50	46	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
230	50	50	48	49	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
231	50	50	47	49	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
232	50	50	51	49	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
233	51	51	53	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
234	51	51	54	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
235	51	51	50	53	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
236	51	51	55	53	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
237	51	51	56	53	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
238	52	52	54	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
239	52	52	55	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
240	52	52	56	54	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
241	52	52	57	54	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
242	52	52	50	54	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
243	53	53	56	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
244	53	53	51	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
245	53	53	57	56	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
246	53	53	58	56	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
247	53	53	59	56	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
248	54	54	52	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
249	54	54	56	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
250	54	54	57	52	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
251	54	54	51	52	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
252	54	54	58	52	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
253	55	55	58	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
254	55	55	52	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
255	55	55	59	58	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
256	55	55	51	58	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
257	55	55	60	58	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
258	56	56	54	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
259	56	56	53	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
260	56	56	59	54	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
261	56	56	52	54	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
262	56	56	51	54	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
263	57	57	59	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
264	57	57	54	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
265	57	57	53	59	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
266	57	57	52	59	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
267	57	57	51	59	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
268	58	58	55	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
269	58	58	54	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
270	58	58	53	55	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
271	58	58	60	55	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
272	58	58	52	55	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
273	59	59	57	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
274	59	59	56	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
275	59	59	55	57	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
276	59	59	54	57	100.0	190.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
277	59	59	60	57	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
278	60	60	61	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
279	60	60	59	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
280	60	60	58	61	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
281	60	60	57	61	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
282	60	60	56	61	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
283	61	61	60	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
284	61	61	59	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
285	61	61	58	60	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
286	61	61	57	60	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
287	61	61	56	60	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
288	62	62	4	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
289	62	62	65	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
290	62	62	5	4	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
291	62	62	14	4	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
292	62	62	15	4	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
293	63	63	4	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
294	63	63	65	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
295	63	63	5	4	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
296	63	63	14	4	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
297	63	63	15	4	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
298	64	64	4	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
299	64	64	65	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
300	64	64	5	4	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
301	64	64	14	4	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
302	64	64	15	4	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
303	65	65	5	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
304	65	65	64	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
305	65	65	3	5	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
306	65	65	2	5	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
307	65	65	63	5	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
308	67	67	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
309	67	67	154	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
310	67	67	153	121	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
311	67	67	120	121	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
312	67	67	71	121	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
313	68	68	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
314	68	68	120	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
315	68	68	72	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
316	68	68	158	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
317	68	68	119	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
318	69	69	155	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
319	69	69	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
320	69	69	120	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
321	69	69	72	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
322	69	69	158	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
323	70	70	156	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
324	70	70	120	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
325	70	70	155	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
326	70	70	71	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
327	70	70	158	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
328	71	71	122	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
329	71	71	119	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
330	71	71	69	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
331	71	71	72	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
332	71	71	158	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
333	72	72	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
334	72	72	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
335	72	72	122	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
336	72	72	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
337	72	72	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
338	73	73	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
339	73	73	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
340	73	73	122	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
341	73	73	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
342	73	73	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
343	74	74	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
344	74	74	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
345	74	74	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
346	74	74	122	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
347	74	74	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
348	75	75	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
349	75	75	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
350	75	75	121	71	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
351	75	75	122	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
352	75	75	70	71	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
353	76	76	67	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
354	76	76	161	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
355	76	76	123	67	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
356	76	76	70	67	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
357	76	76	124	67	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
358	77	77	67	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
359	77	77	161	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
360	77	77	123	67	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
361	77	77	70	67	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
362	77	77	80	67	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
363	78	78	80	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
364	78	78	161	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
365	78	78	67	80	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
366	78	78	123	80	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
367	78	78	70	80	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
368	80	80	82	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
369	80	80	162	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
370	80	80	78	82	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
371	80	80	77	82	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
372	80	80	76	82	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
373	81	81	162	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
374	81	81	78	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
375	81	81	84	162	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
376	81	81	161	162	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
377	81	81	76	162	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
378	82	82	80	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
379	82	82	162	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
380	82	82	84	80	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
381	82	82	78	80	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
382	82	82	161	80	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
383	84	84	82	\N	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
384	84	84	81	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
385	84	84	85	82	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
386	84	84	22	82	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
387	84	84	88	82	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
388	85	85	84	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
389	85	85	33	\N	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
390	85	85	45	84	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
391	85	85	82	84	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
392	85	85	32	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
393	86	86	84	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
394	86	86	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
395	86	86	45	84	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
396	86	86	32	84	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
397	86	86	82	84	150.0	270.0	150.0	110.0	100.0	t	2026-10-12 12:00:55.691554+03
398	87	87	84	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
399	87	87	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
400	87	87	45	84	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
401	87	87	32	84	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
402	87	87	44	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
403	88	88	84	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
404	88	88	33	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
405	88	88	45	84	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
406	88	88	32	84	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
407	88	88	44	84	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
408	89	89	104	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
409	89	89	92	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
410	89	89	93	104	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
411	89	89	148	104	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
412	89	89	150	104	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
413	90	90	93	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
414	90	90	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
415	90	90	145	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
416	90	90	148	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
417	90	90	106	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
418	91	91	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
419	91	91	106	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
420	91	91	145	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
421	91	91	148	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
422	91	91	149	105	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
423	92	92	101	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
424	92	92	89	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
425	92	92	145	101	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
426	92	92	144	101	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
427	92	92	143	101	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
428	93	93	90	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
429	93	93	102	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
430	93	93	89	90	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
431	93	93	101	90	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
432	93	93	145	90	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
433	95	95	97	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
434	95	95	139	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
435	95	95	98	97	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
436	95	95	93	97	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
437	95	95	140	97	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
438	96	96	98	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
439	96	96	139	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
440	96	96	99	98	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
441	96	96	138	98	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
442	96	96	137	98	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
443	97	97	95	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
444	97	97	99	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
445	97	97	139	95	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
446	97	97	100	95	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
447	97	97	138	95	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
448	98	98	96	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
449	98	98	95	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
450	98	98	100	96	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
451	98	98	139	96	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
452	98	98	138	96	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
453	99	99	97	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
454	99	99	100	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
455	99	99	96	97	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
456	99	99	95	97	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
457	99	99	139	97	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
458	100	100	99	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
459	100	100	98	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
460	100	100	97	99	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
461	100	100	96	99	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
462	100	100	95	99	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
463	101	101	104	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
464	101	101	92	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
465	101	101	93	104	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
466	101	101	148	104	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
467	101	101	150	104	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
468	102	102	93	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
469	102	102	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
470	102	102	145	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
471	102	102	148	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
472	102	102	106	93	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
473	103	103	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
474	103	103	106	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
475	103	103	145	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
476	103	103	148	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
477	103	103	149	105	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
478	104	104	101	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
479	104	104	89	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
480	104	104	145	101	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
481	104	104	144	101	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
482	104	104	143	101	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
483	105	105	91	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
484	105	105	103	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
485	105	105	144	91	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
486	105	105	145	91	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
487	105	105	90	91	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
488	106	106	107	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
489	106	106	142	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
490	106	106	145	107	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
491	106	106	108	107	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
492	106	106	103	107	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
493	107	107	106	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
494	107	107	109	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
495	107	107	141	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
496	107	107	140	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
497	107	107	105	106	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
498	108	108	106	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
499	108	108	140	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
500	108	108	105	106	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
501	108	108	145	106	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
502	108	108	132	106	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
503	109	109	110	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
504	109	109	107	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
505	109	109	142	110	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
506	109	109	132	110	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
507	109	109	143	110	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
508	110	110	109	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
509	110	110	131	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
510	110	110	128	109	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
511	110	110	127	109	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
512	110	110	126	109	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
513	112	112	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
514	112	112	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
515	112	112	121	71	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
516	112	112	122	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
517	112	112	70	71	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
518	113	113	112	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
519	113	113	75	\N	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
520	113	113	71	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
521	113	113	118	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
522	113	113	74	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
523	114	114	112	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
524	114	114	75	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
525	114	114	71	112	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
526	114	114	118	112	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
527	114	114	74	112	130.0	230.0	130.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
528	115	115	112	\N	120.0	210.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
529	115	115	75	\N	120.0	210.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
530	115	115	71	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
531	115	115	118	112	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
532	115	115	74	112	120.0	230.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
533	116	116	112	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
534	116	116	75	\N	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
535	116	116	71	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
536	116	116	118	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
537	116	116	74	112	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
538	117	117	112	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
539	117	117	75	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
540	117	117	118	112	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
541	117	117	71	112	120.0	210.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
542	117	117	74	112	120.0	210.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
543	118	118	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
544	118	118	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
545	118	118	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
546	118	118	122	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
547	118	118	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
548	119	119	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
549	119	119	122	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
550	119	119	71	121	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
551	119	119	161	121	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
552	119	119	70	121	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
553	120	120	122	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
554	120	120	70	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
555	120	120	123	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
556	120	120	69	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
557	120	120	68	122	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
558	121	121	157	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
559	121	121	119	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
560	121	121	72	157	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
561	121	121	158	157	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
562	121	121	67	157	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
563	122	122	120	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
564	122	122	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
565	122	122	156	120	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
566	122	122	158	120	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
567	122	122	72	120	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
568	123	123	156	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
569	123	123	155	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
570	123	123	120	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
571	123	123	71	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
572	123	123	158	156	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
573	124	124	71	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
574	124	124	120	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
575	124	124	72	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
576	124	124	158	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
577	124	124	154	71	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
578	126	126	132	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
579	126	126	128	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
580	126	126	131	132	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
581	126	126	110	132	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
582	126	126	130	132	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
583	127	127	132	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
584	127	127	128	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
585	127	127	131	132	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
586	127	127	110	132	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
587	127	127	130	132	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
588	128	128	127	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
589	128	128	126	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
590	128	128	110	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
591	128	128	141	127	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
592	128	128	109	127	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
593	129	129	132	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
594	129	129	127	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
595	129	129	126	132	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
596	129	129	110	132	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
597	129	129	109	132	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
598	130	130	127	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
599	130	130	126	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
600	130	130	110	127	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
601	130	130	109	127	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
602	130	130	141	127	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
603	131	131	127	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
604	131	131	110	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
605	131	131	126	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
606	131	131	141	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
607	131	131	109	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
608	132	132	127	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
609	132	132	129	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
610	132	132	141	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
611	132	132	109	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
612	132	132	126	127	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
613	134	134	136	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
614	134	134	137	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
615	134	134	138	136	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
616	134	134	110	136	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
617	134	134	139	136	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
618	135	135	139	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
619	135	135	140	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
620	135	135	110	139	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
621	135	135	141	139	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
622	135	135	109	139	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
623	136	136	134	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
624	136	136	140	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
625	136	136	110	134	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
626	136	136	141	134	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
627	136	136	109	134	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
628	137	137	134	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
629	137	137	140	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
630	137	137	141	134	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
631	137	137	109	134	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
632	137	137	110	134	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
633	138	138	140	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
634	138	138	134	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
635	138	138	141	140	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
636	138	138	109	140	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
637	138	138	110	140	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
638	139	139	135	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
639	139	139	96	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
640	139	139	95	135	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
641	139	139	141	135	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
642	139	139	109	135	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
643	140	140	138	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
644	140	140	137	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
645	140	140	108	138	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
646	140	140	136	138	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
647	140	140	107	138	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
648	141	141	107	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
649	141	141	142	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
650	141	141	132	107	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
651	141	141	143	107	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
652	141	141	131	107	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
653	142	142	106	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
654	142	142	109	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
655	142	142	141	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
656	142	142	145	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
657	142	142	105	106	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
658	143	143	109	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
659	143	143	141	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
660	143	143	145	109	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
661	143	143	105	109	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
662	143	143	140	109	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
663	144	144	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
664	144	144	104	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
665	144	144	92	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
666	144	144	93	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
667	144	144	109	105	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
668	145	145	106	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
669	145	145	105	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
670	145	145	148	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
671	145	145	143	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
672	145	145	149	106	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
673	148	148	145	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
674	148	148	152	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
675	148	148	89	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
676	148	148	101	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
677	148	148	90	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
678	149	149	145	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
679	149	149	152	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
680	149	149	101	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
681	149	149	89	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
682	149	149	90	145	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
683	150	150	152	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
684	150	150	145	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
685	150	150	89	152	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
686	150	150	101	152	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
687	150	150	102	152	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
688	152	152	155	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
689	152	152	150	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
690	152	152	149	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
691	152	152	148	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
692	152	152	156	155	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
693	153	153	157	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
694	153	153	67	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
695	153	153	124	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
696	153	153	68	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
697	153	153	69	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
698	154	154	157	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
699	154	154	67	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
700	154	154	124	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
701	154	154	68	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
702	154	154	69	157	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
703	155	155	69	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
704	155	155	123	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
705	155	155	70	69	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
706	155	155	152	69	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
707	155	155	122	69	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
708	156	156	123	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
709	156	156	70	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
710	156	156	122	123	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
711	156	156	121	123	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
712	156	156	152	123	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
713	157	157	154	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
714	157	157	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
715	157	157	153	154	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
716	157	157	71	154	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
717	157	157	152	154	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
718	158	158	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
719	158	158	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
720	158	158	122	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
721	158	158	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
722	158	158	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
723	159	159	161	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
724	159	159	122	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
725	159	159	121	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
726	159	159	71	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
727	159	159	70	161	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
728	160	160	122	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
729	160	160	121	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
730	160	160	70	122	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
731	160	160	123	122	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
732	160	160	71	122	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
733	161	161	159	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
734	161	161	73	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
735	161	161	74	159	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
736	161	161	158	159	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
737	161	161	72	159	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
738	162	162	81	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
739	162	162	82	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
740	162	162	80	81	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
741	162	162	161	81	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
742	162	162	78	81	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
743	164	164	166	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
744	164	164	167	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
745	164	164	180	166	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
746	164	164	198	166	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
747	164	164	197	166	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
748	165	165	166	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
749	165	165	167	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
750	165	165	180	166	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
751	165	165	198	166	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
752	165	165	197	166	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
753	166	166	164	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
754	166	166	165	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
755	166	166	185	164	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
756	166	166	188	164	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
757	166	166	187	164	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
758	167	167	164	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
759	167	167	165	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
760	167	167	185	164	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
761	167	167	188	164	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
762	167	167	187	164	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
763	168	168	185	\N	160.0	280.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
764	168	168	186	\N	160.0	290.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
765	168	168	187	185	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
766	168	168	188	185	180.0	320.0	180.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
767	168	168	167	185	180.0	330.0	180.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
768	169	169	185	\N	150.0	280.0	150.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
769	169	169	186	\N	160.0	290.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
770	169	169	187	185	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
771	169	169	188	185	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
772	169	169	167	185	180.0	330.0	180.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
773	171	171	191	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
774	171	171	176	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
775	171	171	126	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
776	171	171	127	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
777	171	171	130	191	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
778	172	172	176	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
779	172	172	191	\N	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
780	172	172	126	176	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
781	172	172	127	176	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
782	172	172	130	176	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
783	173	173	176	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
784	173	173	191	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
785	173	173	126	176	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
786	173	173	127	176	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
787	173	173	190	176	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
788	174	174	191	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
789	174	174	176	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
790	174	174	190	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
791	174	174	126	191	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
792	174	174	127	191	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
793	175	175	191	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
794	175	175	176	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
795	175	175	190	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
796	175	175	126	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
797	175	175	127	191	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
798	176	176	174	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
799	176	176	175	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
800	176	176	173	174	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
801	176	176	171	174	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
802	176	176	172	174	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
803	177	177	179	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
804	177	177	176	\N	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
805	177	177	196	179	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
806	177	177	217	179	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
807	177	177	195	179	120.0	210.0	120.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
808	178	178	179	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
809	178	178	196	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
810	178	178	217	179	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
811	178	178	195	179	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
812	178	178	176	179	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
813	179	179	178	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
814	179	179	177	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
815	179	179	196	178	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
816	179	179	20	178	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
817	179	179	217	178	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
818	180	180	216	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
819	180	180	210	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
820	180	180	211	216	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
821	180	180	212	216	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
822	180	180	165	216	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
823	181	181	216	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
824	181	181	210	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
825	181	181	211	216	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
826	181	181	212	216	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
827	181	181	165	216	140.0	250.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
828	182	182	201	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
829	182	182	183	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
830	182	182	202	201	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
831	182	182	184	201	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
832	182	182	209	201	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
833	183	183	200	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
834	183	183	182	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
835	183	183	184	200	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
836	183	183	202	200	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
837	183	183	209	200	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
838	184	184	183	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
839	184	184	201	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
840	184	184	200	183	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
841	184	184	182	183	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
842	184	184	209	183	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
843	185	185	187	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
844	185	185	188	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
845	185	185	189	187	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
846	185	185	190	187	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
847	185	185	167	187	150.0	260.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
848	186	186	188	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
849	186	186	189	\N	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
850	186	186	190	188	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
851	186	186	191	188	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
852	186	186	167	188	150.0	280.0	150.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
853	187	187	185	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
854	187	187	189	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
855	187	187	190	185	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
856	187	187	191	185	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
857	187	187	176	185	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
858	188	188	186	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
859	188	188	185	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
860	188	188	189	186	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
861	188	188	190	186	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
862	188	188	191	186	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
863	189	189	190	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
864	189	189	188	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
865	189	189	187	190	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
866	189	189	186	190	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
867	189	189	191	190	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
868	190	190	191	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
869	190	190	189	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
870	190	190	174	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
871	190	190	176	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
872	190	190	175	191	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
873	191	191	190	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
874	191	191	174	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
875	191	191	175	190	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
876	191	191	171	190	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
877	191	191	173	190	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
878	192	192	18	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
879	192	192	194	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
880	192	192	220	18	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
881	192	192	219	18	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
882	192	192	5	18	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
883	193	193	14	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
884	193	193	15	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
885	193	193	219	14	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
886	193	193	19	14	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
887	193	193	5	14	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
888	194	194	17	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
889	194	194	192	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
890	194	194	19	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
891	194	194	16	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
892	194	194	14	17	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
893	195	195	20	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
894	195	195	19	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
895	195	195	219	20	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
896	195	195	194	20	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
897	195	195	220	20	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
898	196	196	19	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
899	196	196	219	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
900	196	196	179	19	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
901	196	196	178	19	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
902	196	196	194	19	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
903	197	197	216	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
904	197	197	210	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
905	197	197	211	216	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
906	197	197	212	216	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
907	197	197	165	216	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
908	198	198	216	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
909	198	198	210	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
910	198	198	211	216	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
911	198	198	212	216	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
912	198	198	165	216	130.0	240.0	130.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
913	200	200	183	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
914	200	200	202	\N	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
915	200	200	184	183	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
916	200	200	209	183	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
917	200	200	215	183	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
918	201	201	182	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
919	201	201	184	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
920	201	201	202	182	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
921	201	201	209	182	170.0	320.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
922	201	201	215	182	180.0	320.0	180.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
923	202	202	183	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
924	202	202	201	\N	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
925	202	202	200	183	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
926	202	202	182	183	110.0	200.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
927	202	202	209	183	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
928	203	203	208	\N	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
929	203	203	209	\N	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
930	203	203	215	208	150.0	270.0	150.0	110.0	100.0	t	2026-10-12 12:00:55.691554+03
931	203	203	202	208	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
932	203	203	184	208	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
933	204	204	206	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
934	204	204	205	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
935	204	204	208	206	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
936	204	204	203	206	190.0	340.0	190.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
937	204	204	184	206	200.0	360.0	200.0	150.0	120.0	t	2026-10-12 12:00:55.691554+03
938	205	205	206	\N	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
939	205	205	204	\N	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
940	205	205	207	206	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
941	205	205	208	206	150.0	280.0	150.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
942	205	205	184	206	180.0	330.0	180.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
943	206	206	204	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
944	206	206	207	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
945	206	206	205	204	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
946	206	206	208	204	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
947	206	206	184	204	190.0	350.0	190.0	150.0	120.0	t	2026-10-12 12:00:55.691554+03
948	207	207	206	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
949	207	207	205	\N	120.0	220.0	120.0	90.0	80.0	t	2026-10-12 12:00:55.691554+03
950	207	207	208	206	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
951	207	207	203	206	190.0	340.0	190.0	140.0	120.0	t	2026-10-12 12:00:55.691554+03
952	207	207	214	206	200.0	360.0	200.0	150.0	130.0	t	2026-10-12 12:00:55.691554+03
953	208	208	207	\N	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
954	208	208	204	\N	130.0	230.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
955	208	208	203	207	130.0	240.0	130.0	100.0	80.0	t	2026-10-12 12:00:55.691554+03
956	208	208	206	207	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
957	208	208	214	207	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
958	209	209	214	\N	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
959	209	209	203	\N	150.0	270.0	150.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
960	209	209	216	214	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
961	209	209	210	214	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
962	209	209	181	214	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
963	210	210	197	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
964	210	210	211	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
965	210	210	180	197	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
966	210	210	198	197	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
967	210	210	181	197	100.0	170.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
968	211	211	210	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
969	211	211	216	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
970	211	211	197	210	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
971	211	211	180	210	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
972	211	211	198	210	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
973	212	212	210	\N	100.0	190.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
974	212	212	216	\N	100.0	190.0	100.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
975	212	212	197	210	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
976	212	212	180	210	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
977	212	212	198	210	110.0	210.0	110.0	90.0	70.0	t	2026-10-12 12:00:55.691554+03
978	214	214	209	\N	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
979	214	214	215	\N	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
980	214	214	208	209	140.0	260.0	140.0	110.0	90.0	t	2026-10-12 12:00:55.691554+03
981	214	214	202	209	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
982	214	214	184	209	170.0	310.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
983	215	215	214	\N	140.0	250.0	140.0	100.0	90.0	t	2026-10-12 12:00:55.691554+03
984	215	215	203	\N	150.0	270.0	150.0	110.0	100.0	t	2026-10-12 12:00:55.691554+03
985	215	215	216	214	160.0	300.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
986	215	215	210	214	160.0	300.0	160.0	120.0	100.0	t	2026-10-12 12:00:55.691554+03
987	215	215	181	214	170.0	300.0	170.0	130.0	110.0	t	2026-10-12 12:00:55.691554+03
988	216	216	197	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
989	216	216	180	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
990	216	216	211	197	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
991	216	216	198	197	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
992	216	216	181	197	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
993	217	217	20	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
994	217	217	19	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
995	217	217	219	20	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
996	217	217	194	20	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
997	217	217	220	20	110.0	190.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
998	218	218	219	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
999	218	218	20	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1000	218	218	194	219	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1001	218	218	220	219	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1002	218	218	18	219	100.0	180.0	100.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1003	219	219	218	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1004	219	219	193	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1005	219	219	221	218	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1006	219	219	195	218	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1007	219	219	217	218	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1008	220	220	17	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1009	220	220	192	\N	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1010	220	220	19	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1011	220	220	16	17	90.0	160.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1012	220	220	14	17	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1013	221	221	219	\N	90.0	170.0	90.0	70.0	60.0	t	2026-10-12 12:00:55.691554+03
1014	221	221	19	\N	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
1015	221	221	5	219	100.0	180.0	100.0	80.0	60.0	t	2026-10-12 12:00:55.691554+03
1016	221	221	6	219	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
1017	221	221	218	219	110.0	200.0	110.0	80.0	70.0	t	2026-10-12 12:00:55.691554+03
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: user_presence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_presence (id, user_id, user_type, is_online, latitude, longitude, updated_at) FROM stdin;
1	33	driver	t	9.04200920	38.87410570	2026-08-24 18:56:37.651434
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, full_name, phone_number, email, role, rating, created_at, profile_photo_url, phone_verified, wallet_balance, is_suspended) FROM stdin;
42	Dani	\N	\N	driver	5.00	2026-09-17 11:14:19.196535	https://placehold.co/150	f	0.00	f
43	Dani	\N	\N	rider	5.00	2026-09-17 11:14:42.629272	https://placehold.co/150	f	0.00	f
34	Test Rider One	251911223344	rider1@corridor.com	rider	5.00	2026-08-06 23:36:02.545404	https://placehold.co/150	t	0.00	f
35	Test Rider Two	251922334455	rider2@corridor.com	rider	5.00	2026-08-06 23:36:11.660241	https://placehold.co/150	t	0.00	f
36	Abebe Kebede	251911223344	\N	driver	5.00	2026-08-11 11:19:03.396984	https://placehold.co/150	t	0.00	f
39	cs_userTest	+251911711836	\N	rider	5.00	2026-08-12 13:11:30.898233	https://placehold.co/150	t	0.00	f
40	asfsaf	+251998476704	\N	rider	5.00	2026-08-12 14:50:56.38864	https://placehold.co/150	t	0.00	f
27	Dani Pass	251998476704	\N	rider	5.00	2026-08-05 17:16:43.427925	https://res.cloudinary.com/dv2ff7sl2/image/upload/v1788530591/corridor_profile_photos/user_27_avatar.jpg	t	0.00	f
33	dani	251998476704	\N	driver	5.00	2026-08-05 19:56:36.948814	https://res.cloudinary.com/dv2ff7sl2/image/upload/v1788534779/corridor_profile_photos/user_33_avatar.jpg	t	450.00	f
\.


--
-- Data for Name: vehicles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vehicles (id, driver_id, make, model, plate_number, color, capacity, created_at) FROM stdin;
6	33	Toyota	Corolla	3-45678	White	4	2026-08-06 23:11:36.177486
7	36	Toyota	Vitz	3-98765	Silver	4	2026-08-11 11:19:03.402415
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_transactions (id, user_id, amount, gateway, order_id, transaction_ref, status, created_at) FROM stdin;
1	33	100.00	telebirr	COR-189752	sded	approved	2026-09-05 12:04:21.536266
2	33	250.00	telebirr	COR-991234	ggtg	approved	2026-09-05 12:23:38.342577
3	33	100.00	telebirr	COR-726015	hhiz	approved	2026-09-05 19:09:16.523399
\.


--
-- Name: admin_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_users_id_seq', 1, true);


--
-- Name: commissions_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.commissions_ledger_id_seq', 1, false);


--
-- Name: driver_queue_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.driver_queue_id_seq', 1, false);


--
-- Name: hubs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.hubs_id_seq', 221, true);


--
-- Name: pricing_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pricing_configs_id_seq', 1, true);


--
-- Name: ride_offers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ride_offers_id_seq', 1, false);


--
-- Name: ride_request_solo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ride_request_solo_id_seq', 1, false);


--
-- Name: route_bookings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.route_bookings_id_seq', 1, false);


--
-- Name: route_offers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.route_offers_id_seq', 4, true);


--
-- Name: route_pool_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.route_pool_id_seq', 1, false);


--
-- Name: user_presence_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_presence_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 43, true);


--
-- Name: vehicles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vehicles_id_seq', 8, true);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wallet_transactions_id_seq', 3, true);


--
-- Name: active_user_sessions active_user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_user_sessions
    ADD CONSTRAINT active_user_sessions_pkey PRIMARY KEY (user_id);


--
-- Name: active_user_sessions active_user_sessions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_user_sessions
    ADD CONSTRAINT active_user_sessions_user_id_key UNIQUE (user_id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: commissions_ledger commissions_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commissions_ledger
    ADD CONSTRAINT commissions_ledger_pkey PRIMARY KEY (id);


--
-- Name: driver_profiles driver_profiles_license_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_profiles
    ADD CONSTRAINT driver_profiles_license_number_key UNIQUE (license_number);


--
-- Name: driver_profiles driver_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_profiles
    ADD CONSTRAINT driver_profiles_pkey PRIMARY KEY (driver_id);


--
-- Name: driver_queue driver_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_queue
    ADD CONSTRAINT driver_queue_pkey PRIMARY KEY (id);


--
-- Name: hubs hubs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hubs
    ADD CONSTRAINT hubs_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: pricing_configs pricing_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_configs
    ADD CONSTRAINT pricing_configs_pkey PRIMARY KEY (id);


--
-- Name: ride_offers ride_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_offers
    ADD CONSTRAINT ride_offers_pkey PRIMARY KEY (id);


--
-- Name: ride_request_solo ride_request_solo_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_request_solo
    ADD CONSTRAINT ride_request_solo_pkey PRIMARY KEY (id);


--
-- Name: route_bookings route_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_bookings
    ADD CONSTRAINT route_bookings_pkey PRIMARY KEY (id);


--
-- Name: route_offers route_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_offers
    ADD CONSTRAINT route_offers_pkey PRIMARY KEY (id);


--
-- Name: route_pool route_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_pool
    ADD CONSTRAINT route_pool_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: driver_queue unique_driver_queue_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_queue
    ADD CONSTRAINT unique_driver_queue_id UNIQUE (driver_id);


--
-- Name: user_presence unique_user_presence; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT unique_user_presence UNIQUE (user_id, user_type);


--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_plate_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_plate_number_key UNIQUE (plate_number);


--
-- Name: wallet_transactions wallet_transactions_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_order_id_key UNIQUE (order_id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: idx_active_sessions_role_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_active_sessions_role_status ON public.active_user_sessions USING btree (active_role, status);


--
-- Name: idx_driver_queue_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_driver_queue_lookup ON public.driver_queue USING btree (route_id, current_hub_id, status, entered_at);


--
-- Name: idx_route_pool_aggregation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_route_pool_aggregation ON public.route_pool USING btree (route_id, pickup_hub_id, status);


--
-- Name: idx_route_pool_matched_offer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_route_pool_matched_offer ON public.route_pool USING btree (matched_ride_offer_id);


--
-- Name: idx_route_pool_user_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_route_pool_user_active ON public.route_pool USING btree (user_id, joined_at DESC) WHERE ((status)::text <> ALL ((ARRAY['cancelled'::character varying, 'completed'::character varying])::text[]));


--
-- Name: idx_single_pending_per_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_single_pending_per_user ON public.ride_request_solo USING btree (user_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_solo_request_location; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_solo_request_location ON public.ride_request_solo USING btree (pickup_lat, pickup_lng);


--
-- Name: idx_user_presence_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_presence_status ON public.user_presence USING btree (user_type, is_online);


--
-- Name: idx_users_phone_role_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_users_phone_role_unique ON public.users USING btree (phone_number, role) WHERE ((phone_number IS NOT NULL) AND ((phone_number)::text <> ''::text));


--
-- Name: driver_queue driver_queue_notify_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER driver_queue_notify_trigger AFTER INSERT OR DELETE OR UPDATE ON public.driver_queue FOR EACH ROW EXECUTE FUNCTION public.notify_driver_queue_change();


--
-- Name: driver_queue driver_queue_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER driver_queue_trigger AFTER INSERT OR DELETE OR UPDATE ON public.driver_queue FOR EACH ROW EXECUTE FUNCTION public.notify_driver_queue_change();


--
-- Name: route_pool on_pool_status_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_pool_status_update AFTER UPDATE OF status ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_change();


--
-- Name: ride_offers trg_after_ride_offer_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_after_ride_offer_insert AFTER INSERT ON public.ride_offers FOR EACH ROW EXECUTE FUNCTION public.trg_seed_driver_session();


--
-- Name: route_pool trg_after_route_pool_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_after_route_pool_insert AFTER INSERT ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.trg_seed_passenger_session();


--
-- Name: route_pool trg_auto_accept_manual; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_auto_accept_manual BEFORE INSERT OR UPDATE ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.auto_accept_manual_bookings();


--
-- Name: routes trg_auto_calculate_route_price; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_auto_calculate_route_price BEFORE INSERT OR UPDATE OF pickup_hub_id, drop_off_hub_id, updated_at ON public.routes FOR EACH ROW EXECUTE FUNCTION public.auto_calculate_route_base_price();


--
-- Name: driver_queue trg_driver_queue_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_driver_queue_change AFTER INSERT OR DELETE OR UPDATE ON public.driver_queue FOR EACH ROW EXECUTE FUNCTION public.notify_driver_queue_change();


--
-- Name: pricing_configs trg_propagate_pricing_configs; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_propagate_pricing_configs AFTER INSERT OR UPDATE OF base_flag_down, rate_per_km, rate_per_minute, minimum_fare, fuel_multiplier, surge_multiplier, corridor_2pax_mult, corridor_3pax_mult, corridor_4pax_mult ON public.pricing_configs FOR EACH STATEMENT EXECUTE FUNCTION public.propagate_pricing_config_changes();


--
-- Name: ride_offers trg_ride_offer_expired; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ride_offer_expired BEFORE UPDATE OF status ON public.ride_offers FOR EACH ROW WHEN ((((new.status)::text = 'expired'::text) AND ((old.status)::text <> 'expired'::text))) EXECUTE FUNCTION public.handle_expired_ride_offer();


--
-- Name: ride_offers trg_ride_offer_notify; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ride_offer_notify AFTER INSERT OR DELETE OR UPDATE ON public.ride_offers FOR EACH ROW EXECUTE FUNCTION public.notify_ride_offer_change();


--
-- Name: ride_offers trg_ride_offers_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ride_offers_change AFTER INSERT OR DELETE OR UPDATE ON public.ride_offers FOR EACH ROW EXECUTE FUNCTION public.notify_ride_offers_change();


--
-- Name: ride_offers trg_ride_status_notify; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ride_status_notify AFTER UPDATE OF status ON public.ride_offers FOR EACH ROW EXECUTE FUNCTION public.notify_ride_status_change();


--
-- Name: route_pool trg_route_pool_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_route_pool_change AFTER INSERT OR DELETE OR UPDATE ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.notify_route_pool_change();


--
-- Name: route_pool trg_route_pool_matched; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_route_pool_matched AFTER INSERT OR UPDATE OF status, matched_ride_offer_id ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.notify_route_pool_match();


--
-- Name: route_pool trg_route_pool_notify; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_route_pool_notify AFTER INSERT OR DELETE OR UPDATE ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.notify_route_pool_change();


--
-- Name: route_pool trg_route_pool_status_notify; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_route_pool_status_notify AFTER UPDATE OF status ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.notify_ride_status_change();


--
-- Name: ride_offers trg_sync_manual_from_driver; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_manual_from_driver AFTER UPDATE OF status ON public.ride_offers FOR EACH ROW EXECUTE FUNCTION public.sync_manual_from_driver_offer();


--
-- Name: route_pool trg_sync_manual_from_peer; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_manual_from_peer AFTER UPDATE OF status ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.sync_manual_from_peer_status();


--
-- Name: route_pool trg_update_accepted_passengers; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_accepted_passengers AFTER UPDATE OF status ON public.route_pool FOR EACH ROW EXECUTE FUNCTION public.update_ride_offer_accepted_passengers();


--
-- Name: active_user_sessions active_user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.active_user_sessions
    ADD CONSTRAINT active_user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: commissions_ledger commissions_ledger_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commissions_ledger
    ADD CONSTRAINT commissions_ledger_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id);


--
-- Name: driver_profiles driver_profiles_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_profiles
    ADD CONSTRAINT driver_profiles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: driver_queue driver_queue_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.driver_queue
    ADD CONSTRAINT driver_queue_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ride_offers ride_offers_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_offers
    ADD CONSTRAINT ride_offers_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ride_offers ride_offers_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ride_offers
    ADD CONSTRAINT ride_offers_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: route_pool route_pool_matched_ride_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.route_pool
    ADD CONSTRAINT route_pool_matched_ride_offer_id_fkey FOREIGN KEY (matched_ride_offer_id) REFERENCES public.ride_offers(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 27zUXjSh015mlyJVfaK38ycd9tDOhjZ0NLWTZGHb90421ZxQpmSHhMxmvwlbSfa

