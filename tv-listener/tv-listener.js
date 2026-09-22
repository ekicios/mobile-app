// TV-side listener for Samsung Tizen (MSF). Load after vendor/msf-2.0.14.min.js.
// Reusable: any Tizen app can `listen(channelName, onCommand)` to receive
// { type: 'key'|'text', value } commands sent over the MSF channel.
(function (global) {
  function listen(channelName, onCommand) {
    if (!global.msf) throw new Error('msf vendor script not loaded');
    global.msf.local(function (err, service) {
      if (err) throw err;
      const channel = service.channel(channelName);
      channel.on('say', function (message) {
        try { onCommand(JSON.parse(message)); }
        catch (e) { onCommand(String(message)); }
      });
      channel.connect({ name: 'TvSample' });
    });
  }

  global.TVListener = { listen };
})(typeof window !== 'undefined' ? window : globalThis);
