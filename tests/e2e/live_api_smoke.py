"""HTTP integration on an explicitly disposable, loopback development database.

Start the real backend first. Supply SEED_USERNAME and SEED_PASSWORD through the
environment. No credentials, authorization headers or tokens are written to output.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-synthetic-writes', action='store_true')
    args = parser.parse_args()
    if not args.allow_synthetic_writes:
        parser.error('Pass --allow-synthetic-writes only for a disposable development DB.')
    base = os.environ.get('APP_URL', 'http://127.0.0.1:8000').rstrip('/')
    url = urlsplit(base)
    if url.scheme != 'http' or url.hostname not in {'127.0.0.1', 'localhost', '::1'}:
        parser.error('APP_URL must be a loopback HTTP URL.')
    username = os.environ.get('SEED_USERNAME', 'demo_organizer')
    password = os.environ['SEED_PASSWORD']
    checks = []

    def call(method, path, payload=None, token=None):
        headers = {'Accept': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        request = Request(base + '/api/v1' + path, method=method, headers=headers,
                          data=json.dumps(payload).encode() if payload is not None else None)
        try:
            response = urlopen(request, timeout=20)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    status, listing = call('GET', '/events?page=1&pageSize=1')
    assert status == 200 and isinstance(listing['data'], list)
    assert listing['page'] == 1 and listing['page_size'] == 1
    checks.append('public_event_list_and_pagination_contract')
    assert call('GET', '/users/me')[0] == 401
    assert call('POST', '/events', {})[0] == 401
    checks.append('protected_endpoints_require_bearer_token')
    wrong_password = 'wrong-synthetic-password' if password != 'wrong-synthetic-password' else 'another-wrong-password'
    assert call('POST', '/auth/login', {'username': username, 'password': wrong_password})[0] == 401
    checks.append('incorrect_password_rejected')
    status, auth = call('POST', '/auth/login', {'username': username, 'password': password})
    assert status == 200 and auth['token_type'] == 'bearer' and auth['access_token']
    token = auth['access_token']
    status, profile = call('GET', '/users/me', token=token)
    assert status == 200 and profile['username'] == username
    checks.append('json_login_and_authenticated_profile')
    assert call('GET', '/users/me', token='synthetic-invalid-token')[0] == 401
    checks.append('invalid_token_rejected')
    event = {'title': 'Synthetic integration event', 'overview': 'Disposable test data only.',
             'location': 'Synthetic community centre', 'start_time': '2027-01-10T09:00:00+08:00',
             'end_time': '2027-01-10T10:00:00+08:00', 'online_quota': 10, 'offline_quota': 5}
    invalid = {**event, 'end_time': '2027-01-10T08:00:00+08:00'}
    assert call('POST', '/events', invalid, token)[0] == 422
    checks.append('invalid_event_timestamps_rejected')
    # Ensure the browser can exercise its first and second six-item pages.
    for number in range(1, 5):
        assert call('POST', '/events', {**event, 'title': f'Synthetic pagination fixture {number}'}, token)[0] == 201
    status, created = call('POST', '/events', event, token)
    assert status == 201 and len(created['public_id']) == 21
    status, detail = call('GET', '/events/' + created['public_id'])
    assert status == 200 and detail['title'] == event['title']
    status, listing = call('GET', '/events?page=1&pageSize=1')
    assert status == 200 and listing['data'][0]['public_id'] == created['public_id']
    assert listing['total_count'] >= 2 and listing['total_pages'] == listing['total_count']
    status, second = call('GET', '/events?page=2&pageSize=1')
    assert status == 200 and second['data'][0]['public_id'] != created['public_id']
    checks.append('create_readback_and_distinct_second_page')
    assert call('GET', '/events?page=0')[0] == 422
    assert call('GET', '/events?pageSize=101')[0] == 422
    checks.append('invalid_pagination_rejected')
    print(json.dumps({'status': 'PASS', 'checked_at': datetime.now(timezone.utc).isoformat(),
                      'checks': checks, 'created_public_id': created['public_id'],
                      'data_scope': 'synthetic development records',
                      'runtime_scope': 'Record Python and database engine separately; this test does not certify native PostgreSQL.'}, indent=2))


if __name__ == '__main__':
    main()
