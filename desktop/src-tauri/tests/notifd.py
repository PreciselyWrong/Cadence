# Mock org.freedesktop.Notifications for notify.rs (`a_click_reaches_its_choice`): logs each
# Notify call and answers it with ActionInvoked(<argv[1]>), then NotificationClosed.
import sys
from gi.repository import Gio, GLib
ACTION = sys.argv[1]
XML = """<node><interface name='org.freedesktop.Notifications'>
<method name='GetCapabilities'><arg type='as' direction='out'/></method>
<method name='GetServerInformation'><arg type='s' direction='out'/><arg type='s' direction='out'/><arg type='s' direction='out'/><arg type='s' direction='out'/></method>
<method name='Notify'><arg type='s'/><arg type='u'/><arg type='s'/><arg type='s'/><arg type='s'/><arg type='as'/><arg type='a{sv}'/><arg type='i'/><arg type='u' direction='out'/></method>
<method name='CloseNotification'><arg type='u'/></method>
<signal name='ActionInvoked'><arg type='u'/><arg type='s'/></signal>
<signal name='NotificationClosed'><arg type='u'/><arg type='u'/></signal>
</interface></node>"""
node = Gio.DBusNodeInfo.new_for_xml(XML)
conn = Gio.bus_get_sync(Gio.BusType.SESSION)
def call(c, sender, path, iface, method, params, inv):
    if method == 'GetCapabilities':
        inv.return_value(GLib.Variant('(as)', (['body', 'body-markup', 'actions'],)))
    elif method == 'GetServerInformation':
        inv.return_value(GLib.Variant('(ssss)', ('mock', 'test', '1', '1.2')))
    elif method == 'Notify':
        app, _, icon, summary, body, actions, hints, timeout = params.unpack()
        print('NOTIFY', summary, '|', body.replace('\n', '\\n'), '|', actions, '|', sorted(hints), '| timeout', timeout, flush=True)
        inv.return_value(GLib.Variant('(u)', (7,)))
        GLib.timeout_add(300, lambda: (c.emit_signal(None, path, iface, 'ActionInvoked', GLib.Variant('(us)', (7, ACTION))),
            c.emit_signal(None, path, iface, 'NotificationClosed', GLib.Variant('(uu)', (7, 2))), False)[-1])
    else:
        inv.return_value(None)
conn.register_object('/org/freedesktop/Notifications', node.interfaces[0], call, None, None)
Gio.bus_own_name_on_connection(conn, 'org.freedesktop.Notifications', 0, None, None)
GLib.timeout_add_seconds(15, lambda: loop.quit())
loop = GLib.MainLoop(); loop.run()
