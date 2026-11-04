# Cartrack GPS fleet connection

The `gps-fleet.html` page reads the Philippine Cartrack Fleet API through the
`cartrack-fleet` Supabase Edge Function. API credentials belong only in Supabase
Edge Function secrets. Never put them in HTML, browser settings, a repository,
an issue, screenshots, or a chat message.

## Configure

1. Create a dedicated Cartrack subuser, restrict it to vehicle/map viewing and
   select the vehicles it should access in **User Data Access → Vehicles & Groups**.
   Save that configuration. Generate **User Credentials** with **Standard access**.
   Standard access itself does not mean read-only; the subuser permissions also
   need review. If a credential was exposed, regenerate it before configuring.
2. In the AMANAH Supabase project open **Edge Functions → Secrets**:
   <https://supabase.com/dashboard/project/bafmycjninxomufhkjvy/functions/secrets>
3. Add and save these secrets directly in that dashboard:

   | Name | Value |
   | --- | --- |
   | `CARTRACK_API_USERNAME` | The **API Username** shown in the subuser credential row. Cartrack uses the main account username here, not the subuser login name. |
   | `CARTRACK_API_PASSWORD` | The subuser's newly generated **API Password**. |

   The Supabase URL and publishable/legacy anon key are supplied by the Edge
   runtime. No service-role key or new database schema is used by this function.
4. Deploy `supabase/functions/cartrack-fleet/` as **cartrack-fleet**, entrypoint
   `index.ts`, with **verify_jwt = true**. Keep all four function files together.
   Updating secrets does not require redeploying the function.
5. Sign in to AMANAH and open **Equipment → GPS Fleet Tracking → Refresh fleet**.

## Access and behavior

- Every request verifies the signed-in user with Supabase Auth and calls the
  existing `amanah_get_current_permissions` RPC using that user's JWT. Either
  `master_data.equipment` or `equipment_history.view` is required, including for
  cached responses. No user-editable metadata is used for authorization.
- CORS permits only the existing GitHub Pages origin. Backend requests still
  require valid user authentication and equipment permission.
- The provider target is fixed to `GET https://fleetapi-ph.cartrack.com/rest/vehicles/status`.
  The function does not accept an arbitrary URL, expose commands, or write to Cartrack.
- Only selected display fields are returned. Driver identities, personal
  contact data, raw provider responses, and credentials are omitted.
- Odometer is converted from documented default meters to kilometers. Provider
  timestamps with explicit offsets are normalized to UTC, then displayed in
  Philippine time. A missing timezone is shown as unavailable rather than guessed.
- The view refreshes every 60 seconds while visible. Backend isolates share
  concurrent fetches and reuse a snapshot for up to 30 seconds; this is an
  optimization, not a global rate limiter. Provider retry headers are respected.
- "Recent" means a valid location timestamp within 15 minutes and no explicitly
  insufficient GPS fix. Older/unknown positions are clearly marked. These labels
  do not prove a device is online/offline or that a vehicle is at that location now.
- Failed refreshes retain the last displayed snapshot and show an alert. Signing
  out or losing access clears it. No GPS history is written to the database.
- Equipment/project matching, trip playback and historical route storage are
  later phases. This first phase displays the integration's latest fleet snapshot.

## Verify after secrets are saved

- A signed-in equipment user sees the intended fleet and can focus/filter markers.
- Check the returned vehicle count against Cartrack's saved subuser access.
- Compare a plate, coordinates, GPS update time and odometer against Cartrack.
- A missing/old tracker timestamp remains visibly old after refreshing the page.
- Anonymous callers and roles without equipment permission cannot fetch positions.
- Browser network responses and public source must contain no provider credential.

Automated verification: `node --test tests/*.test.cjs`.

Primary API references:
- <https://developer.cartrack.com/docs/fleet-api-general/authentication/>
- <https://developer.cartrack.com/docs/fleet-api/get-vehicles-status-location-fuel-odometer-and-more/>
- <https://developer.cartrack.com/openapi/openapi.yaml>
- <https://supabase.com/docs/guides/functions/secrets>
