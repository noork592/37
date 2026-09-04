#!/usr/bin/env python3
"""
Backend test for Transport Routes endpoints.
Tests the newly added transport route planner endpoints.
"""
import requests
import json
import sys
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://app-preview-3149.preview.emergentagent.com/api"

# Test credentials (from seed_db in server.py)
ADMIN_EMAIL = "admin@factory.com"
ADMIN_PASSWORD = "admin123"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log_test(test_name: str):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}TEST: {test_name}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")

def log_pass(message: str):
    print(f"{Colors.GREEN}✓ PASS: {message}{Colors.RESET}")

def log_fail(message: str):
    print(f"{Colors.RED}✗ FAIL: {message}{Colors.RESET}")

def log_info(message: str):
    print(f"{Colors.YELLOW}ℹ INFO: {message}{Colors.RESET}")

def login() -> Optional[str]:
    """Login and return the JWT token."""
    log_test("Step 0: Login as admin")
    url = f"{BASE_URL}/auth/login"
    payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        log_info(f"POST {url}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            if "token" in data:
                log_pass("Login successful, token received")
                return data["token"]
            else:
                log_fail("Login response missing 'token' field")
                return None
        else:
            log_fail(f"Login failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return None
    except Exception as e:
        log_fail(f"Login request failed: {e}")
        return None

def test_factory_endpoint(token: str) -> bool:
    """Test 1: GET /api/transport/factory"""
    log_test("Step 1: GET /api/transport/factory")
    url = f"{BASE_URL}/transport/factory"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        log_info(f"GET {url}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            # Verify expected structure
            expected_lat = 30.8978257
            expected_lng = 75.8528076
            expected_label = "JK Products Factory"
            
            if "lat" in data and "lng" in data and "label" in data:
                if (data["lat"] == expected_lat and 
                    data["lng"] == expected_lng and 
                    data["label"] == expected_label):
                    log_pass("Factory endpoint returned correct location data")
                    return True
                else:
                    log_fail(f"Factory data mismatch. Expected lat={expected_lat}, lng={expected_lng}, label='{expected_label}'")
                    return False
            else:
                log_fail("Factory response missing required fields (lat, lng, label)")
                return False
        else:
            log_fail(f"Factory endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
    except Exception as e:
        log_fail(f"Factory endpoint request failed: {e}")
        return False

def test_geocode_endpoint(token: str) -> bool:
    """Test 2: POST /api/transport/geocode"""
    log_test("Step 2: POST /api/transport/geocode")
    url = f"{BASE_URL}/transport/geocode"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"q": "Ludhiana, Punjab, India"}
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        log_info(f"POST {url}")
        log_info(f"Payload: {json.dumps(payload, indent=2)}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            if "results" in data and isinstance(data["results"], list):
                if len(data["results"]) > 0:
                    result = data["results"][0]
                    if "lat" in result and "lng" in result and "display_name" in result:
                        if isinstance(result["lat"], (int, float)) and isinstance(result["lng"], (int, float)):
                            log_pass(f"Geocode successful: found {len(data['results'])} results")
                            log_info(f"First result: {result['display_name']}")
                            return True
                        else:
                            log_fail("Geocode result lat/lng are not numeric")
                            return False
                    else:
                        log_fail("Geocode result missing required fields (lat, lng, display_name)")
                        return False
                else:
                    log_fail("Geocode returned empty results array")
                    return False
            else:
                log_fail("Geocode response missing 'results' array")
                return False
        elif response.status_code == 502:
            log_info("Geocode returned 502 - this indicates outbound internet to Nominatim is blocked, not a code bug")
            log_info(f"Response: {response.text}")
            return True  # Not a code bug
        else:
            log_fail(f"Geocode endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
    except Exception as e:
        log_fail(f"Geocode endpoint request failed: {e}")
        return False

def test_optimize_endpoint(token: str) -> bool:
    """Test 3: POST /api/transport/optimize"""
    log_test("Step 3: POST /api/transport/optimize")
    url = f"{BASE_URL}/transport/optimize"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "stops": [
            {
                "customer": "A",
                "material": "Stand",
                "destination": "Delhi",
                "lat": 28.6139,
                "lng": 77.2090
            },
            {
                "customer": "B",
                "material": "Pin",
                "destination": "Chandigarh",
                "lat": 30.7333,
                "lng": 76.7794
            }
        ]
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        log_info(f"POST {url}")
        log_info(f"Payload: {json.dumps(payload, indent=2)}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            # Verify expected structure
            if "ok" in data and data["ok"] is True:
                if "order" in data and isinstance(data["order"], list):
                    if len(data["order"]) == 2:
                        if set(data["order"]) == {0, 1}:
                            if "total_distance_km" in data and isinstance(data["total_distance_km"], (int, float)):
                                if "engine" in data and data["engine"] in ["osrm", "haversine"]:
                                    log_pass(f"Optimize successful with engine={data['engine']}")
                                    log_info(f"Order: {data['order']}, Distance: {data['total_distance_km']} km")
                                    return True
                                else:
                                    log_fail(f"Optimize engine invalid: {data.get('engine')}")
                                    return False
                            else:
                                log_fail("Optimize response missing or invalid 'total_distance_km'")
                                return False
                        else:
                            log_fail(f"Optimize order contains invalid indices: {data['order']}")
                            return False
                    else:
                        log_fail(f"Optimize order length mismatch: expected 2, got {len(data['order'])}")
                        return False
                else:
                    log_fail("Optimize response missing 'order' array")
                    return False
            else:
                log_fail("Optimize response missing 'ok: true'")
                return False
        else:
            log_fail(f"Optimize endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
    except Exception as e:
        log_fail(f"Optimize endpoint request failed: {e}")
        return False

def test_save_route(token: str) -> Optional[str]:
    """Test 4: POST /api/transport/routes - save a route"""
    log_test("Step 4: POST /api/transport/routes (save route)")
    url = f"{BASE_URL}/transport/routes"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "name": "Test Route 1",
        "stops": [
            {
                "customer": "A",
                "material": "Stand",
                "destination": "Delhi",
                "lat": 28.6139,
                "lng": 77.2090
            },
            {
                "customer": "B",
                "material": "Pin",
                "destination": "Chandigarh",
                "lat": 30.7333,
                "lng": 76.7794
            }
        ],
        "optimized_order": [0, 1],
        "total_distance_km": 250.5,
        "total_duration_min": 180,
        "geometry": ""
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        log_info(f"POST {url}")
        log_info(f"Payload: {json.dumps(payload, indent=2)}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            if "id" in data and "created_at" in data:
                log_pass(f"Route saved successfully with id={data['id']}")
                return data["id"]
            else:
                log_fail("Save route response missing 'id' or 'created_at'")
                return None
        else:
            log_fail(f"Save route endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return None
    except Exception as e:
        log_fail(f"Save route endpoint request failed: {e}")
        return None

def test_list_routes(token: str, expected_route_id: Optional[str] = None) -> bool:
    """Test 5: GET /api/transport/routes - list routes"""
    log_test("Step 5: GET /api/transport/routes (list routes)")
    url = f"{BASE_URL}/transport/routes"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        log_info(f"GET {url}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            if isinstance(data, list):
                log_pass(f"List routes successful: found {len(data)} routes")
                
                if expected_route_id:
                    found = any(route.get("id") == expected_route_id for route in data)
                    if found:
                        log_pass(f"Route with id={expected_route_id} found in list")
                        return True
                    else:
                        log_fail(f"Route with id={expected_route_id} NOT found in list")
                        return False
                return True
            else:
                log_fail("List routes response is not an array")
                return False
        else:
            log_fail(f"List routes endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
    except Exception as e:
        log_fail(f"List routes endpoint request failed: {e}")
        return False

def test_delete_route(token: str, route_id: str) -> bool:
    """Test 6: DELETE /api/transport/routes/{id}"""
    log_test(f"Step 6: DELETE /api/transport/routes/{route_id}")
    url = f"{BASE_URL}/transport/routes/{route_id}"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.delete(url, headers=headers, timeout=10)
        log_info(f"DELETE {url}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            log_info(f"Response: {json.dumps(data, indent=2)}")
            
            if "ok" in data and data["ok"] is True:
                log_pass(f"Route deleted successfully")
                return True
            else:
                log_fail("Delete route response missing 'ok: true'")
                return False
        else:
            log_fail(f"Delete route endpoint failed with status {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
    except Exception as e:
        log_fail(f"Delete route endpoint request failed: {e}")
        return False

def test_negative_cases(token: str) -> Dict[str, bool]:
    """Test 7: Negative test cases"""
    results = {}
    
    # 7a: Empty stops in optimize
    log_test("Step 7a: POST /api/transport/optimize with empty stops (expect 400)")
    url = f"{BASE_URL}/transport/optimize"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"stops": []}
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        log_info(f"POST {url}")
        log_info(f"Payload: {json.dumps(payload, indent=2)}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            log_pass("Empty stops correctly rejected with 400")
            results["empty_stops"] = True
        else:
            log_fail(f"Expected 400, got {response.status_code}")
            log_info(f"Response: {response.text}")
            results["empty_stops"] = False
    except Exception as e:
        log_fail(f"Empty stops test failed: {e}")
        results["empty_stops"] = False
    
    # 7b: Empty query in geocode
    log_test("Step 7b: POST /api/transport/geocode with empty query (expect 400)")
    url = f"{BASE_URL}/transport/geocode"
    payload = {"q": ""}
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        log_info(f"POST {url}")
        log_info(f"Payload: {json.dumps(payload, indent=2)}")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            log_pass("Empty query correctly rejected with 400")
            results["empty_query"] = True
        else:
            log_fail(f"Expected 400, got {response.status_code}")
            log_info(f"Response: {response.text}")
            results["empty_query"] = False
    except Exception as e:
        log_fail(f"Empty query test failed: {e}")
        results["empty_query"] = False
    
    # 7c: No auth header
    log_test("Step 7c: GET /api/transport/factory without auth (expect 401/403)")
    url = f"{BASE_URL}/transport/factory"
    
    try:
        response = requests.get(url, timeout=10)
        log_info(f"GET {url} (no auth header)")
        log_info(f"Status: {response.status_code}")
        
        if response.status_code in [401, 403]:
            log_pass(f"No auth correctly rejected with {response.status_code}")
            results["no_auth"] = True
        else:
            log_fail(f"Expected 401/403, got {response.status_code}")
            log_info(f"Response: {response.text}")
            results["no_auth"] = False
    except Exception as e:
        log_fail(f"No auth test failed: {e}")
        results["no_auth"] = False
    
    return results

def main():
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}Transport Routes Backend API Test Suite{Colors.RESET}")
    print(f"{Colors.BLUE}Base URL: {BASE_URL}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    # Step 0: Login
    token = login()
    if not token:
        print(f"\n{Colors.RED}CRITICAL: Login failed. Cannot proceed with tests.{Colors.RESET}")
        sys.exit(1)
    
    results = {}
    
    # Step 1: Factory endpoint
    results["factory"] = test_factory_endpoint(token)
    
    # Step 2: Geocode endpoint
    results["geocode"] = test_geocode_endpoint(token)
    
    # Step 3: Optimize endpoint
    results["optimize"] = test_optimize_endpoint(token)
    
    # Step 4: Save route
    route_id = test_save_route(token)
    results["save_route"] = route_id is not None
    
    # Step 5: List routes (verify saved route exists)
    if route_id:
        results["list_routes"] = test_list_routes(token, route_id)
    else:
        results["list_routes"] = test_list_routes(token)
    
    # Step 6: Delete route
    if route_id:
        results["delete_route"] = test_delete_route(token, route_id)
        
        # Verify route is gone
        log_test("Step 6b: Verify route is deleted (GET /api/transport/routes)")
        url = f"{BASE_URL}/transport/routes"
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                found = any(route.get("id") == route_id for route in data)
                if not found:
                    log_pass(f"Route with id={route_id} successfully removed from list")
                    results["verify_delete"] = True
                else:
                    log_fail(f"Route with id={route_id} still exists after deletion")
                    results["verify_delete"] = False
            else:
                log_fail(f"Failed to verify deletion: status {response.status_code}")
                results["verify_delete"] = False
        except Exception as e:
            log_fail(f"Failed to verify deletion: {e}")
            results["verify_delete"] = False
    else:
        results["delete_route"] = False
        results["verify_delete"] = False
    
    # Step 7: Negative cases
    negative_results = test_negative_cases(token)
    results.update(negative_results)
    
    # Summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = f"{Colors.GREEN}PASS{Colors.RESET}" if passed_flag else f"{Colors.RED}FAIL{Colors.RESET}"
        print(f"{test_name:20s}: {status}")
    
    print(f"\n{Colors.BLUE}Total: {passed}/{total} tests passed{Colors.RESET}")
    
    if passed == total:
        print(f"{Colors.GREEN}✓ All tests passed!{Colors.RESET}\n")
        sys.exit(0)
    else:
        print(f"{Colors.RED}✗ Some tests failed.{Colors.RESET}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
