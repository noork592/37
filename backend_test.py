#!/usr/bin/env python3
"""
Backend test for Transports master endpoints
Tests the newly added transports CRUD endpoints and their integration with optimize/routes
"""
import requests
import json
import sys
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://app-preview-3149.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@factory.com"
ADMIN_PASSWORD = "admin123"
USER_EMAIL = "user@factory.com"
USER_PASSWORD = "user123"

# Color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures = []
    
    def pass_test(self, name: str, detail: str = ""):
        self.passed += 1
        print(f"{GREEN}✓ PASS{RESET}: {name}")
        if detail:
            print(f"  {detail}")
    
    def fail_test(self, name: str, detail: str):
        self.failed += 1
        self.failures.append(f"{name}: {detail}")
        print(f"{RED}✗ FAIL{RESET}: {name}")
        print(f"  {RED}{detail}{RESET}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"\n{RED}FAILED TESTS:{RESET}")
            for f in self.failures:
                print(f"  - {f}")
        print(f"{'='*60}\n")
        return self.failed == 0

def login(email: str, password: str) -> Optional[str]:
    """Login and return bearer token"""
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"{RED}Login failed for {email}: {resp.status_code} {resp.text}{RESET}")
            return None
    except Exception as e:
        print(f"{RED}Login exception for {email}: {e}{RESET}")
        return None

def make_request(method: str, endpoint: str, token: Optional[str] = None, 
                 json_data: Optional[Dict] = None, expected_status: int = 200) -> tuple:
    """Make HTTP request and return (status_code, response_json, success)"""
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=10)
        elif method == "PATCH":
            resp = requests.patch(url, headers=headers, json=json_data, timeout=10)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=10)
        else:
            return (0, {}, False)
        
        try:
            resp_json = resp.json()
        except:
            resp_json = {"raw": resp.text}
        
        success = resp.status_code == expected_status
        return (resp.status_code, resp_json, success)
    except Exception as e:
        return (0, {"error": str(e)}, False)

def test_transports_master():
    """Test all Transports master endpoints per review request"""
    result = TestResult()
    
    print(f"\n{BLUE}{'='*60}")
    print("TRANSPORTS MASTER ENDPOINTS TEST")
    print(f"{'='*60}{RESET}\n")
    
    # Login as admin
    print(f"{YELLOW}→ Logging in as admin...{RESET}")
    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_token:
        result.fail_test("Admin login", "Failed to get admin token")
        result.summary()
        return False
    result.pass_test("Admin login", f"Token: {admin_token[:20]}...")
    
    # Login as regular user for later tests
    print(f"\n{YELLOW}→ Logging in as regular user...{RESET}")
    user_token = login(USER_EMAIL, USER_PASSWORD)
    if not user_token:
        result.fail_test("User login", "Failed to get user token")
    else:
        result.pass_test("User login", f"Token: {user_token[:20]}...")
    
    # Store created transport IDs
    transport_ids = {}
    
    # ========================================================================
    # STEP 1: Create three transports
    # ========================================================================
    print(f"\n{BLUE}STEP 1: Create three transports{RESET}")
    
    transports_to_create = [
        {"name": "Ludhiana Depot", "lat": 30.8978, "lng": 75.8528},
        {"name": "Chandigarh Hub", "lat": 30.7333, "lng": 76.7794},
        {"name": "Delhi Yard", "lat": 28.6139, "lng": 77.2090}
    ]
    
    for t in transports_to_create:
        status, data, success = make_request("POST", "/transports", admin_token, t, 200)
        if success and "id" in data:
            transport_ids[t["name"]] = data["id"]
            result.pass_test(
                f"Create transport: {t['name']}", 
                f"ID: {data['id']}, created_at: {data.get('created_at')}, created_by: {data.get('created_by')}"
            )
        else:
            result.fail_test(
                f"Create transport: {t['name']}", 
                f"Status {status}, Response: {json.dumps(data, indent=2)}"
            )
    
    # ========================================================================
    # STEP 2: GET /api/transports - verify all three, sorted alphabetically
    # ========================================================================
    print(f"\n{BLUE}STEP 2: List transports (should be sorted alphabetically){RESET}")
    
    status, data, success = make_request("GET", "/transports", admin_token, None, 200)
    if success and isinstance(data, list):
        # Filter to only our test transports
        our_transports = [t for t in data if t.get("name") in transport_ids.keys()]
        names = [t.get("name") for t in our_transports]
        expected_order = ["Chandigarh Hub", "Delhi Yard", "Ludhiana Depot"]
        
        if names == expected_order:
            result.pass_test(
                "List transports (alphabetical order)", 
                f"Order correct: {names}"
            )
        else:
            result.fail_test(
                "List transports (alphabetical order)", 
                f"Expected {expected_order}, got {names}"
            )
    else:
        result.fail_test(
            "List transports", 
            f"Status {status}, Response: {json.dumps(data, indent=2)}"
        )
    
    # ========================================================================
    # STEP 3: Negative cases on create
    # ========================================================================
    print(f"\n{BLUE}STEP 3: Negative cases on create{RESET}")
    
    # Case-insensitive duplicate
    status, data, success = make_request(
        "POST", "/transports", admin_token, 
        {"name": "LUDHIANA DEPOT", "lat": 30, "lng": 75}, 
        409
    )
    if success:
        result.pass_test("Create duplicate (case-insensitive)", f"Got 409 as expected: {data.get('detail')}")
    else:
        result.fail_test("Create duplicate (case-insensitive)", f"Expected 409, got {status}: {data}")
    
    # Empty name
    status, data, success = make_request(
        "POST", "/transports", admin_token, 
        {"name": "", "lat": 30, "lng": 75}, 
        400
    )
    if success:
        result.pass_test("Create with empty name", f"Got 400 as expected: {data.get('detail')}")
    else:
        result.fail_test("Create with empty name", f"Expected 400, got {status}: {data}")
    
    # Lat out of range
    status, data, success = make_request(
        "POST", "/transports", admin_token, 
        {"name": "Bad", "lat": 95, "lng": 75}, 
        400
    )
    if success:
        result.pass_test("Create with lat out of range", f"Got 400 as expected: {data.get('detail')}")
    else:
        result.fail_test("Create with lat out of range", f"Expected 400, got {status}: {data}")
    
    # Lng out of range
    status, data, success = make_request(
        "POST", "/transports", admin_token, 
        {"name": "Bad", "lat": 30, "lng": 200}, 
        400
    )
    if success:
        result.pass_test("Create with lng out of range", f"Got 400 as expected: {data.get('detail')}")
    else:
        result.fail_test("Create with lng out of range", f"Expected 400, got {status}: {data}")
    
    # ========================================================================
    # STEP 4: PATCH /api/transports/{id}
    # ========================================================================
    print(f"\n{BLUE}STEP 4: Update transport (PATCH){RESET}")
    
    chd_id = transport_ids.get("Chandigarh Hub")
    if not chd_id:
        result.fail_test("PATCH tests", "Chandigarh Hub ID not found")
    else:
        # Valid update
        status, data, success = make_request(
            "PATCH", f"/transports/{chd_id}", admin_token,
            {"name": "Chandigarh Depot", "lat": 30.74, "lng": 76.78},
            200
        )
        if success and data.get("name") == "Chandigarh Depot":
            transport_ids["Chandigarh Depot"] = chd_id
            del transport_ids["Chandigarh Hub"]
            result.pass_test(
                "PATCH valid update", 
                f"Updated to: {data.get('name')}, lat={data.get('lat')}, lng={data.get('lng')}"
            )
        else:
            result.fail_test("PATCH valid update", f"Status {status}, Response: {data}")
        
        # Duplicate name
        status, data, success = make_request(
            "PATCH", f"/transports/{chd_id}", admin_token,
            {"name": "Ludhiana Depot"},
            409
        )
        if success:
            result.pass_test("PATCH duplicate name", f"Got 409 as expected: {data.get('detail')}")
        else:
            result.fail_test("PATCH duplicate name", f"Expected 409, got {status}: {data}")
        
        # Empty body
        status, data, success = make_request(
            "PATCH", f"/transports/{chd_id}", admin_token,
            {},
            400
        )
        if success:
            result.pass_test("PATCH empty body", f"Got 400 as expected: {data.get('detail')}")
        else:
            result.fail_test("PATCH empty body", f"Expected 400, got {status}: {data}")
        
        # Unknown ID
        fake_id = "00000000-0000-0000-0000-000000000000"
        status, data, success = make_request(
            "PATCH", f"/transports/{fake_id}", admin_token,
            {"name": "Test"},
            404
        )
        if success:
            result.pass_test("PATCH unknown ID", f"Got 404 as expected: {data.get('detail')}")
        else:
            result.fail_test("PATCH unknown ID", f"Expected 404, got {status}: {data}")
    
    # ========================================================================
    # STEP 5: POST /api/transport/optimize with new shape
    # ========================================================================
    print(f"\n{BLUE}STEP 5: Optimize route with transport_id and name fields{RESET}")
    
    ludhiana_id = transport_ids.get("Ludhiana Depot")
    delhi_id = transport_ids.get("Delhi Yard")
    chd_depot_id = transport_ids.get("Chandigarh Depot")
    
    if not all([ludhiana_id, delhi_id, chd_depot_id]):
        result.fail_test("Optimize test", f"Missing transport IDs: {transport_ids}")
    else:
        optimize_payload = {
            "stops": [
                {"transport_id": ludhiana_id, "name": "Ludhiana Depot", "lat": 30.8978, "lng": 75.8528},
                {"transport_id": delhi_id, "name": "Delhi Yard", "lat": 28.6139, "lng": 77.2090},
                {"transport_id": chd_depot_id, "name": "Chandigarh Depot", "lat": 30.74, "lng": 76.78}
            ]
        }
        
        status, data, success = make_request(
            "POST", "/transport/optimize", admin_token,
            optimize_payload,
            200
        )
        
        if success:
            ok = data.get("ok")
            order = data.get("order")
            distance = data.get("total_distance_km")
            engine = data.get("engine")
            
            checks = []
            if ok is True:
                checks.append("ok=true")
            else:
                checks.append(f"ok={ok} (expected true)")
            
            if isinstance(order, list) and len(order) == 3:
                checks.append(f"order={order} (length 3)")
            else:
                checks.append(f"order={order} (expected list of length 3)")
            
            if isinstance(distance, (int, float)):
                checks.append(f"distance={distance} km")
            else:
                checks.append(f"distance={distance} (expected numeric)")
            
            if engine in ["osrm", "haversine"]:
                checks.append(f"engine={engine}")
            else:
                checks.append(f"engine={engine} (expected osrm or haversine)")
            
            all_valid = ok is True and isinstance(order, list) and len(order) == 3 and \
                       isinstance(distance, (int, float)) and engine in ["osrm", "haversine"]
            
            if all_valid:
                result.pass_test("Optimize with transport_id/name", ", ".join(checks))
            else:
                result.fail_test("Optimize with transport_id/name", ", ".join(checks))
        else:
            result.fail_test("Optimize with transport_id/name", f"Status {status}, Response: {data}")
    
    # ========================================================================
    # STEP 6: Save + list + delete transports-based route
    # ========================================================================
    print(f"\n{BLUE}STEP 6: Save, list, and delete route{RESET}")
    
    saved_route_id = None
    
    # Save route
    route_payload = {
        "name": "Delhi-Chd Run",
        "stops": [
            {"transport_id": ludhiana_id, "name": "Ludhiana Depot", "lat": 30.8978, "lng": 75.8528},
            {"transport_id": delhi_id, "name": "Delhi Yard", "lat": 28.6139, "lng": 77.2090},
            {"transport_id": chd_depot_id, "name": "Chandigarh Depot", "lat": 30.74, "lng": 76.78}
        ]
    }
    
    status, data, success = make_request(
        "POST", "/transport/routes", admin_token,
        route_payload,
        200
    )
    
    if success and "id" in data:
        saved_route_id = data["id"]
        result.pass_test(
            "Save route", 
            f"ID: {saved_route_id}, name: {data.get('name')}, created_at: {data.get('created_at')}"
        )
    else:
        result.fail_test("Save route", f"Status {status}, Response: {data}")
    
    # List routes
    status, data, success = make_request("GET", "/transport/routes", admin_token, None, 200)
    if success and isinstance(data, list):
        found = any(r.get("id") == saved_route_id for r in data)
        if found:
            result.pass_test("List routes", f"Found saved route in list (total {len(data)} routes)")
        else:
            result.fail_test("List routes", f"Saved route {saved_route_id} not found in list")
    else:
        result.fail_test("List routes", f"Status {status}, Response: {data}")
    
    # Delete route
    if saved_route_id:
        status, data, success = make_request(
            "DELETE", f"/transport/routes/{saved_route_id}", admin_token,
            None, 200
        )
        if success and data.get("ok") is True:
            result.pass_test("Delete route", f"Route {saved_route_id} deleted successfully")
        else:
            result.fail_test("Delete route", f"Status {status}, Response: {data}")
    
    # ========================================================================
    # STEP 7: Auth / role checks
    # ========================================================================
    print(f"\n{BLUE}STEP 7: Auth and role checks{RESET}")
    
    if not user_token:
        result.fail_test("Auth tests", "User token not available")
    else:
        # Non-admin tries to delete transport (should get 403)
        ludhiana_id = transport_ids.get("Ludhiana Depot")
        if ludhiana_id:
            status, data, success = make_request(
                "DELETE", f"/transports/{ludhiana_id}", user_token,
                None, 403
            )
            if success:
                result.pass_test("Non-admin DELETE transport", f"Got 403 as expected: {data.get('detail')}")
            else:
                result.fail_test("Non-admin DELETE transport", f"Expected 403, got {status}: {data}")
        
        # Non-admin can list transports
        status, data, success = make_request("GET", "/transports", user_token, None, 200)
        if success:
            result.pass_test("Non-admin GET transports", f"Got 200, {len(data)} transports listed")
        else:
            result.fail_test("Non-admin GET transports", f"Expected 200, got {status}: {data}")
        
        # Non-admin can create transport
        status, data, success = make_request(
            "POST", "/transports", user_token,
            {"name": "User Test Transport", "lat": 30.5, "lng": 75.5},
            200
        )
        if success and "id" in data:
            user_transport_id = data["id"]
            result.pass_test("Non-admin POST transport", f"Created transport ID: {user_transport_id}")
            # Clean up this test transport
            make_request("DELETE", f"/transports/{user_transport_id}", admin_token, None, 200)
        else:
            result.fail_test("Non-admin POST transport", f"Expected 200, got {status}: {data}")
    
    # No auth header (should get 401 or 403)
    status, data, success = make_request("GET", "/transports", None, None, 403)
    if status in [401, 403]:
        result.pass_test("No auth header", f"Got {status} as expected")
    else:
        result.fail_test("No auth header", f"Expected 401 or 403, got {status}: {data}")
    
    # ========================================================================
    # STEP 8: Cleanup
    # ========================================================================
    print(f"\n{BLUE}STEP 8: Cleanup (delete test transports){RESET}")
    
    for name, tid in transport_ids.items():
        status, data, success = make_request("DELETE", f"/transports/{tid}", admin_token, None, 200)
        if success:
            print(f"  {GREEN}✓{RESET} Deleted {name} ({tid})")
        else:
            print(f"  {YELLOW}⚠{RESET} Failed to delete {name}: {status} {data}")
    
    # Final summary
    return result.summary()

if __name__ == "__main__":
    success = test_transports_master()
    sys.exit(0 if success else 1)
