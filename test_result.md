#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  The software had an email OTP two-step login feature that the admin could toggle on/off per user
  from the Admin → Users page. On the cloned repo this was hidden. Two things were fixed:
  1. Backend: `OTP_LOGIN_ENABLED` in /app/backend/server.py was hardcoded to False. Set to True.
  2. Frontend: the per-row "OTP login" Switch in Admin → Users was hidden on mobile (`hidden sm:flex`).
     Removed the `hidden` class so the toggle is visible on all screen sizes.

backend:
  - task: "OTP email login flow (login → challenge → verify-otp)"
    implemented: true
    working: "NA"
    file: "backend/server.py"

  - task: "Transport Routes: geocode, optimize, save/list/delete"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New feature: transport route planner with map. Backend endpoints (all require Bearer auth via /api/auth/login):
            GET  /api/transport/factory           → {lat, lng, label} for the pinned factory (30.8978257, 75.8528076).
            POST /api/transport/geocode           body {q}  → {results:[{lat,lng,display_name}...]}. Uses Nominatim (needs internet).
            POST /api/transport/optimize          body {stops:[{customer,material,destination,lat,lng}]}  →
                                                   {ok:true, engine:"osrm"|"haversine", order:[i...], total_distance_km, total_duration_min, geometry}.
                                                   Uses OSRM public /trip endpoint; falls back to nearest-neighbour haversine if OSRM is unreachable.
            GET  /api/transport/routes            → list of saved routes (newest first).
            POST /api/transport/routes            body {name, stops, optimized_order?, total_distance_km?, total_duration_min?, geometry?} → saved doc.
            DELETE /api/transport/routes/{id}     → admin-only, returns {ok:true}.
          Please verify: login as admin@jkproducts.local / admin123 → hit factory (200), geocode "Ludhiana, Punjab" (expect at least one result),
          optimize with two stops (e.g. Ludhiana + Delhi coordinates) — engine should be "osrm" if the OSRM public server is reachable,
          otherwise "haversine". Then POST a route, GET routes (should contain it), DELETE it (200), then GET again should not include it.
      - working: true
        agent: "testing"
        comment: |
          ✅ ALL TRANSPORT ROUTES ENDPOINTS WORKING CORRECTLY
          
          Tested all 6 endpoints plus negative cases. Results:
          
          1. GET /api/transport/factory → 200 OK
             - Returned correct factory location: {lat: 30.8978257, lng: 75.8528076, label: "JK Products Factory"}
          
          2. POST /api/transport/geocode → 200 OK
             - Successfully geocoded "Ludhiana, Punjab, India"
             - Returned 2 results with valid lat/lng coordinates and display_name
             - Nominatim integration working (outbound internet access confirmed)
          
          3. POST /api/transport/optimize → 200 OK
             - Successfully optimized route with 2 stops (Delhi + Chandigarh)
             - Engine: "osrm" (OSRM public server reachable, not using fallback)
             - Returned valid order [1, 0], distance: 369.1 km, duration: 281.2 min
             - Geometry polyline included
          
          4. POST /api/transport/routes → 200 OK
             - Successfully saved route with UUID: 3d6e56a1-c3e4-496f-94df-aab156434da9
             - Response includes id, created_at, created_by fields
          
          5. GET /api/transport/routes → 200 OK
             - Successfully listed routes
             - Saved route found in list (newest first ordering confirmed)
          
          6. DELETE /api/transport/routes/{id} → 200 OK
             - Successfully deleted route (admin-only endpoint working)
             - Verified route removed from subsequent GET request
          
          7. Negative cases - all working correctly:
             - Empty stops in optimize → 400 (correct validation)
             - Empty query in geocode → 400 (correct validation)
             - No auth header → 403 (correct auth enforcement)
          
          Note: Review request specified admin@jkproducts.local but actual seeded credentials are admin@factory.com / admin123 (from seed_db function). This is a minor documentation discrepancy, not a code issue. All tests passed using correct credentials.

    stuck_count: 0
    priority: "high"
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Re-enabled OTP two-step login by flipping OTP_LOGIN_ENABLED to True (server.py ~line 780).
          Flow to verify:
            (a) POST /api/auth/login with a user whose `otp_login=false` → returns {token, user} directly (no otp_required).
            (b) Admin PATCH /api/users/{id}/otp with {"otp_login": true} → 200, and GET /api/users shows otp_login=true.
            (c) POST /api/auth/login for that user (correct password) → returns {"otp_required": true, "challenge_id": "..."}.
            (d) Read the OTP from backend logs (line "Admin OTP for <email> (challenge <id>): <code>") and
                POST /api/auth/verify-otp with {challenge_id, code} → 200 with {token, user}.
            (e) Wrong code → 401. Toggling otp_login back to false → login returns token directly again.
          Default admin creds: admin@jkproducts.local / admin123. Default user: user@jkproducts.local / user123.
          Email delivery is best-effort; the code is always logged to backend.err.log so tests can read it there.

frontend:
  - task: "Admin → Users: per-row OTP login toggle visible + Add-user OTP switch works"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/AdminUsers.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Removed `hidden sm:flex` on the per-row OTP login toggle so it is visible on every viewport.
          Login as admin (admin@jkproducts.local / admin123), open Admin → Users, and confirm each user row
          shows an "OTP login" pill with a Switch (data-testid=`otp-toggle-<userId>`). Toggling should
          call PATCH /api/users/{id}/otp and persist. The Add-user dialog also has data-testid=`add-user-otp`.
          Frontend-only verification — no separate frontend testing is being requested here.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Please test only the backend OTP login flow described in the task above.
      Base URL: use REACT_APP_BACKEND_URL from /app/frontend/.env with the /api prefix.
      Admin creds: admin@jkproducts.local / admin123.
      Steps: (1) login as admin with otp off → expect token, (2) PATCH otp_login=true on the second seeded user
      (user@jkproducts.local), (3) login as that user → expect otp_required + challenge_id, (4) read the OTP
      from `/var/log/supervisor/backend.err.log` (line: `Admin OTP for user@jkproducts.local (challenge ...): NNNNNN`),
      (5) POST /api/auth/verify-otp → expect a valid token, (6) toggle otp_login back to false and confirm
      the same user's next login returns a token directly (no otp_required).
  - agent: "testing"
    message: |
      ✅ Transport Routes backend testing COMPLETE - ALL TESTS PASSED (10/10)
      
      Tested all 6 transport endpoints plus 3 negative cases:
      - GET /api/transport/factory ✅
      - POST /api/transport/geocode ✅ (Nominatim working)
      - POST /api/transport/optimize ✅ (OSRM engine working, not fallback)
      - POST /api/transport/routes (save) ✅
      - GET /api/transport/routes (list) ✅
      - DELETE /api/transport/routes/{id} ✅
      - Negative cases (empty validation, no auth) ✅
      
      All endpoints working correctly with proper auth, validation, and error handling.
      
      Minor note: Review request mentioned admin@jkproducts.local but actual seeded credentials are admin@factory.com (from seed_db). Updated test_credentials.md for future reference.
