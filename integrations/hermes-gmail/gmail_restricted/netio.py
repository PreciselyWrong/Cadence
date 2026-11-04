"""The single network primitive. Tests replace it with a fake; nothing else opens sockets."""

import socket
import urllib.error
import urllib.request


class NetworkTimeout(Exception):
    """The request may or may not have reached the server."""


class NetworkError(Exception):
    """The request did not complete (DNS, refused connection, TLS)."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(method, url, headers, body=None, timeout=30):
    """Return (status, body_bytes). HTTP error statuses are returned, not raised."""
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except (socket.timeout, TimeoutError) as error:
        raise NetworkTimeout(str(error)) from None
    except urllib.error.URLError as error:
        if isinstance(error.reason, (socket.timeout, TimeoutError)):
            raise NetworkTimeout(str(error.reason)) from None
        raise NetworkError(type(error.reason).__name__) from None
