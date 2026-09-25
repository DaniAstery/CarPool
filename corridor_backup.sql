--
-- PostgreSQL database dump
--

\restrict 7QMTjmpdqg84RTdtTdOUPVS7K2ML7Uqs3xOu8T34JjrcEGp5aiYlQSsHWFoU67U

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
1	Meskel Square Terminal	9.01050000	38.76150000
2	Bambis Supermarket Hub	9.00690000	38.76520000
3	Urael Church Junction	9.00330000	38.76890000
4	Bole Olympia Hub	8.99970000	38.77260000
5	Bole Japan Embassy Hub	8.99610000	38.77630000
6	Bole Medhanialem Square	8.99250000	38.78000000
7	Bole Atlas Junction	8.98890000	38.78370000
8	Bole Airport Gate Terminal	8.98530000	38.78740000
9	Megenagna Terminal	9.01950000	38.80180000
10	Gurd Shola Main Road Hub	9.02000000	38.80580000
11	Imperial Hotel Junction	9.02050000	38.80980000
12	Salite Mihret Asphalt Hub	9.02100000	38.81380000
13	Century Mall Road Hub	9.02150000	38.81780000
14	CMC Sunshine Junction	9.02200000	38.82180000
15	CMC Michael Church Hub	9.02280000	38.83450000
16	Ayat Square Terminal	9.02380000	38.84750000
17	Mexico Square Terminal	9.01040000	38.74410000
18	Lideta High Court Main Hub	9.00680000	38.74050000
19	Torhailoch Main Junction	9.00620000	38.72080000
20	Bisrate Gabriel Church Hub	8.99960000	38.73330000
21	Sarbet Traffic Light Hub	8.99340000	38.73630000
22	Hana Mariam Main Road Hub	8.98980000	38.73270000
23	Mebrat Hail Lebu Hub	8.98620000	38.72910000
24	Jemo 1 Main Square Terminal	8.96690000	38.72090000
25	Jemo 3 Final Terminal	8.94500000	38.71500000
26	Gotera Interchange Hub	8.98660000	38.75620000
27	Nefas Silk Power Station Hub	8.97900000	38.76100000
28	Saris Abo Church Hub	8.97100000	38.76600000
29	Saris Mebrat Hail Hub	8.96000000	38.76900000
30	Adey Abeba Square Hub (Saris)	8.94800000	38.77200000
31	Kality Ring Road Terminal	8.91000000	38.75000000
32	Piassa Arada Terminal	9.03450000	38.75250000
33	Arat Kilo University Hub	9.03600000	38.76300000
34	Amanuel Church Hub	9.03850000	38.74600000
35	Amest Kilo Monument Hub	4.04000000	38.76150000
36	Sidist Kilo Campus Hub	9.04300000	38.76000000
37	Shiro Meda Terminal	9.05500000	38.76600000
38	Autobus Tera Terminal	9.02800000	38.73600000
39	Kolfe Keranio Hub	9.03000000	38.71000000
40	18 Mazoria Junction	9.03350000	38.71350000
41	Wingate Square Hub	9.05380000	38.71800000
42	Ayer Tena Terminal	8.99300000	38.69700000
43	Legehar Station Terminal	9.00800000	38.75000000
44	Stadium Junction Hub	9.01050000	38.75350000
45	Kasanchis Total Hub	9.01500000	38.76800000
46	Bole 22 Mazoria Hub	9.01700000	38.78500000
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
1	1	1	8	2	170.0	320.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
2	1	1	7	2	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
3	1	1	6	2	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
4	1	1	5	2	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
5	1	1	4	2	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
6	1	1	3	2	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
7	1	1	2	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
8	2	2	8	3	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
9	2	2	7	3	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
10	2	2	6	3	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
11	2	2	5	3	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
12	2	2	4	3	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
13	2	2	3	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
14	2	2	1	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
15	3	3	8	4	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
16	3	3	7	4	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
17	3	3	6	4	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
18	3	3	5	4	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
19	3	3	4	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
20	3	3	2	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
21	3	3	1	2	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
22	4	4	8	5	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
23	4	4	7	5	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
24	4	4	6	5	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
25	4	4	5	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
26	4	4	3	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
27	4	4	2	3	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
28	4	4	1	2	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
29	5	5	8	6	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
30	5	5	7	6	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
31	5	5	6	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
32	5	5	4	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
33	5	5	3	4	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
34	5	5	2	3	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
35	5	5	1	2	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
36	6	6	8	7	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
37	6	6	7	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
38	6	6	5	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
39	6	6	4	5	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
40	6	6	3	4	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
41	6	6	2	3	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
42	6	6	1	2	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
43	7	7	8	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
44	7	7	6	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
45	7	7	5	6	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
46	7	7	4	5	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
47	7	7	3	4	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
48	7	7	2	3	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
49	7	7	1	2	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
50	8	8	7	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
51	8	8	6	7	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
52	8	8	5	6	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
53	8	8	4	5	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
54	8	8	3	4	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
55	8	8	2	3	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
56	8	8	1	2	170.0	320.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
57	43	43	46	44	170.0	320.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
58	43	43	45	44	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
59	43	43	44	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
60	44	44	46	45	160.0	300.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
61	44	44	45	\N	110.0	210.0	110.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
62	44	44	43	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
63	45	45	46	\N	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
64	45	45	44	\N	110.0	210.0	110.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
65	45	45	43	44	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
66	46	46	45	\N	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
67	46	46	44	45	160.0	300.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
68	46	46	43	44	170.0	320.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
69	9	9	16	10	200.0	370.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
70	9	9	15	10	160.0	300.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
71	9	9	14	10	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
72	9	9	13	10	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
73	9	9	12	10	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
74	9	9	11	10	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
75	9	9	10	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
76	10	10	16	11	190.0	350.0	190.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
77	10	10	15	11	150.0	280.0	150.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
78	10	10	14	11	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
79	10	10	13	11	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
80	10	10	12	11	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
81	10	10	11	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
82	10	10	9	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
83	11	11	16	12	180.0	330.0	180.0	140.0	110.0	t	2026-09-17 12:40:07.818652+03
84	11	11	15	12	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
85	11	11	14	12	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
86	11	11	13	12	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
87	11	11	12	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
88	11	11	10	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
89	11	11	9	10	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
90	12	12	16	13	170.0	300.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
91	12	12	15	13	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
92	12	12	14	13	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
93	12	12	13	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
94	12	12	11	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
95	12	12	10	11	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
96	12	12	9	10	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
97	13	13	16	14	160.0	280.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
98	13	13	15	14	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
99	13	13	14	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
100	13	13	12	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
101	13	13	11	12	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
102	13	13	10	11	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
103	13	13	9	10	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
104	14	14	16	15	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
105	14	14	15	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
106	14	14	13	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
107	14	14	12	13	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
108	14	14	11	12	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
109	14	14	10	11	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
110	14	14	9	10	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
111	15	15	16	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
112	15	15	14	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
113	15	15	13	14	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
114	15	15	12	13	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
115	15	15	11	12	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
116	15	15	10	11	150.0	280.0	150.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
117	15	15	9	10	160.0	300.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
118	16	16	15	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
119	16	16	14	15	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
120	16	16	13	14	160.0	280.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
121	16	16	12	13	170.0	300.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
122	16	16	11	12	180.0	330.0	180.0	140.0	110.0	t	2026-09-17 12:40:07.818652+03
123	16	16	10	11	190.0	350.0	190.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
124	16	16	9	10	200.0	370.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
125	25	25	17	19	280.0	500.0	280.0	210.0	180.0	t	2026-09-17 12:40:07.818652+03
126	25	25	18	19	260.0	480.0	260.0	200.0	170.0	t	2026-09-17 12:40:07.818652+03
127	25	25	21	19	220.0	400.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
128	25	25	20	19	240.0	430.0	240.0	180.0	150.0	t	2026-09-17 12:40:07.818652+03
129	25	25	22	19	210.0	380.0	210.0	160.0	130.0	t	2026-09-17 12:40:07.818652+03
130	25	25	23	19	200.0	360.0	200.0	150.0	120.0	t	2026-09-17 12:40:07.818652+03
131	25	25	24	19	140.0	250.0	140.0	100.0	90.0	t	2026-09-17 12:40:07.818652+03
132	25	25	19	\N	250.0	450.0	250.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
133	19	19	17	24	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
134	19	19	18	24	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
135	19	19	21	24	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
136	19	19	20	24	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
137	19	19	22	24	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
138	19	19	23	24	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
139	19	19	24	\N	180.0	330.0	180.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
140	19	19	25	\N	250.0	450.0	250.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
141	24	24	17	23	210.0	390.0	210.0	160.0	140.0	t	2026-09-17 12:40:07.818652+03
142	24	24	18	23	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
143	24	24	21	23	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
144	24	24	20	23	170.0	310.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
145	24	24	22	23	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
146	24	24	23	\N	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
147	24	24	19	\N	180.0	330.0	180.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
148	24	24	25	19	140.0	250.0	140.0	100.0	90.0	t	2026-09-17 12:40:07.818652+03
149	23	23	17	22	150.0	280.0	150.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
150	23	23	18	22	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
151	23	23	21	22	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
152	23	23	20	22	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
153	23	23	22	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
154	23	23	24	\N	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
155	23	23	19	24	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
156	23	23	25	19	200.0	360.0	200.0	150.0	120.0	t	2026-09-17 12:40:07.818652+03
157	22	22	17	20	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
158	22	22	18	20	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
159	22	22	21	20	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
160	22	22	20	\N	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
161	22	22	23	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
162	22	22	24	23	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
163	22	22	19	24	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
164	22	22	25	19	210.0	380.0	210.0	160.0	130.0	t	2026-09-17 12:40:07.818652+03
165	20	20	17	21	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
166	20	20	18	21	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
167	20	20	21	\N	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
168	20	20	22	\N	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
169	20	20	23	22	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
170	20	20	24	23	170.0	310.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
171	20	20	19	24	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
172	20	20	25	19	240.0	430.0	240.0	180.0	150.0	t	2026-09-17 12:40:07.818652+03
173	21	21	17	18	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
174	21	21	18	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
175	21	21	20	\N	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
176	21	21	22	20	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
177	21	21	23	22	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
178	21	21	24	23	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
179	21	21	19	24	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
180	21	21	25	19	220.0	400.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
181	18	18	17	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
182	18	18	21	\N	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
183	18	18	20	21	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
184	18	18	22	20	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
185	18	18	23	22	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
186	18	18	24	23	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
187	18	18	19	24	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
188	18	18	25	19	260.0	480.0	260.0	200.0	170.0	t	2026-09-17 12:40:07.818652+03
189	17	17	18	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
190	17	17	21	18	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
191	17	17	20	21	120.0	210.0	120.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
192	17	17	22	20	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
193	17	17	23	22	150.0	280.0	150.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
194	17	17	24	23	210.0	390.0	210.0	160.0	140.0	t	2026-09-17 12:40:07.818652+03
195	17	17	19	24	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
196	17	17	25	19	280.0	500.0	280.0	210.0	180.0	t	2026-09-17 12:40:07.818652+03
197	34	34	37	32	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
198	34	34	33	32	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
199	34	34	35	32	14360.0	26110.0	14360.0	10880.0	9140.0	t	2026-09-17 12:40:07.818652+03
200	34	34	36	32	110.0	210.0	110.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
201	34	34	32	\N	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
202	32	32	37	36	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
203	32	32	33	36	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
204	32	32	35	36	14350.0	26090.0	14350.0	10870.0	9130.0	t	2026-09-17 12:40:07.818652+03
205	32	32	36	\N	100.0	190.0	100.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
206	32	32	34	\N	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
207	36	36	37	35	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
208	36	36	33	35	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
209	36	36	35	\N	14380.0	26140.0	14380.0	10890.0	9150.0	t	2026-09-17 12:40:07.818652+03
210	36	36	32	\N	100.0	190.0	100.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
211	36	36	34	32	110.0	210.0	110.0	90.0	70.0	t	2026-09-17 12:40:07.818652+03
212	35	35	37	33	14410.0	26200.0	14410.0	10920.0	9170.0	t	2026-09-17 12:40:07.818652+03
213	35	35	33	\N	14360.0	26100.0	14360.0	10880.0	9140.0	t	2026-09-17 12:40:07.818652+03
214	35	35	36	\N	14380.0	26140.0	14380.0	10890.0	9150.0	t	2026-09-17 12:40:07.818652+03
215	35	35	32	36	14350.0	26090.0	14350.0	10870.0	9130.0	t	2026-09-17 12:40:07.818652+03
216	35	35	34	32	14360.0	26110.0	14360.0	10880.0	9140.0	t	2026-09-17 12:40:07.818652+03
217	33	33	37	\N	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
218	33	33	35	\N	14360.0	26100.0	14360.0	10880.0	9140.0	t	2026-09-17 12:40:07.818652+03
219	33	33	36	35	90.0	170.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
220	33	33	32	36	100.0	180.0	100.0	80.0	60.0	t	2026-09-17 12:40:07.818652+03
221	33	33	34	32	120.0	220.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
222	37	37	33	\N	130.0	230.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
223	37	37	35	33	14410.0	26200.0	14410.0	10920.0	9170.0	t	2026-09-17 12:40:07.818652+03
224	37	37	36	35	110.0	200.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
225	37	37	32	36	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
226	37	37	34	32	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
227	31	31	30	26	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
228	31	31	29	26	220.0	410.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
229	31	31	28	26	250.0	460.0	250.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
230	31	31	27	26	270.0	490.0	270.0	210.0	170.0	t	2026-09-17 12:40:07.818652+03
231	31	31	26	\N	290.0	530.0	290.0	220.0	190.0	t	2026-09-17 12:40:07.818652+03
232	26	26	30	27	190.0	350.0	190.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
233	26	26	29	27	160.0	280.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
234	26	26	28	27	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
235	26	26	27	\N	100.0	180.0	100.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
236	26	26	31	\N	290.0	530.0	290.0	220.0	190.0	t	2026-09-17 12:40:07.818652+03
237	27	27	30	28	170.0	300.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
238	27	27	29	28	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
239	27	27	28	\N	100.0	180.0	100.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
240	27	27	26	\N	100.0	180.0	100.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
241	27	27	31	26	270.0	490.0	270.0	210.0	170.0	t	2026-09-17 12:40:07.818652+03
242	28	28	30	29	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
243	28	28	29	\N	100.0	190.0	100.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
244	28	28	27	\N	100.0	180.0	100.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
245	28	28	26	27	120.0	230.0	120.0	90.0	80.0	t	2026-09-17 12:40:07.818652+03
246	28	28	31	26	250.0	460.0	250.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
247	29	29	30	\N	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
248	29	29	28	\N	100.0	190.0	100.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
249	29	29	27	28	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
250	29	29	26	27	160.0	280.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
251	29	29	31	26	220.0	410.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
252	30	30	29	\N	110.0	190.0	110.0	80.0	70.0	t	2026-09-17 12:40:07.818652+03
253	30	30	28	29	140.0	250.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
254	30	30	27	28	170.0	300.0	170.0	130.0	110.0	t	2026-09-17 12:40:07.818652+03
255	30	30	26	27	190.0	350.0	190.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
256	30	30	31	26	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
257	42	42	38	39	220.0	400.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
258	42	42	41	39	260.0	460.0	260.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
259	42	42	40	39	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
260	42	42	39	\N	180.0	330.0	180.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
261	39	39	38	40	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
262	39	39	41	40	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
263	39	39	40	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
264	39	39	42	\N	180.0	330.0	180.0	140.0	120.0	t	2026-09-17 12:40:07.818652+03
265	40	40	38	41	140.0	250.0	140.0	100.0	90.0	t	2026-09-17 12:40:07.818652+03
266	40	40	41	\N	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
267	40	40	39	\N	90.0	160.0	90.0	70.0	60.0	t	2026-09-17 12:40:07.818652+03
268	40	40	42	39	200.0	360.0	200.0	150.0	130.0	t	2026-09-17 12:40:07.818652+03
269	41	41	38	\N	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
270	41	41	40	\N	130.0	240.0	130.0	100.0	80.0	t	2026-09-17 12:40:07.818652+03
271	41	41	39	40	140.0	260.0	140.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
272	41	41	42	39	260.0	460.0	260.0	190.0	160.0	t	2026-09-17 12:40:07.818652+03
273	38	38	41	\N	160.0	290.0	160.0	120.0	100.0	t	2026-09-17 12:40:07.818652+03
274	38	38	40	41	140.0	250.0	140.0	100.0	90.0	t	2026-09-17 12:40:07.818652+03
275	38	38	39	40	150.0	260.0	150.0	110.0	90.0	t	2026-09-17 12:40:07.818652+03
276	38	38	42	39	220.0	400.0	220.0	170.0	140.0	t	2026-09-17 12:40:07.818652+03
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

SELECT pg_catalog.setval('public.hubs_id_seq', 46, true);


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
-- Name: hubs hubs_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hubs
    ADD CONSTRAINT hubs_name_key UNIQUE (name);


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

\unrestrict 7QMTjmpdqg84RTdtTdOUPVS7K2ML7Uqs3xOu8T34JjrcEGp5aiYlQSsHWFoU67U

