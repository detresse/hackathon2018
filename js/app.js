$('document').ready(function() {
  $("#slider-geo-on-off").on("slidestop",controller.shutOffGeolocation);
  $("#slider-high-accuracy").on("slidestop",controller.toggleHighAccuracy);
  $("#slider-accumulate-pts").on("slidestop",controller.toggleAccumulate);
  $("#slider-handle-err").on("slidestop",controller.toggleErrorAlerts)
})

$('document').ready( function() {controller.deviceReady = true});
var controller = controller || {};

controller.map = null;
controller.helper = null;
controller.deviceReady = false;
controller.markerSymbol = null;
controller.utils = {};
controller.viewChange = null;
controller.accumulate = true;
controller.timeout = 60000;
controller.maximumAge = 60000;
controller.timeoutCurrentPos = 60000;
controller.maxAgeCurrentPos = 60000;
controller.zoomLevel = 14;
controller.useAlerts = true;

controller.localStorageEnum = (function() {
  var values = {
    ZOOM_LEVEL:"zoom_level",
    LAT:"lat",
    LON:"lon",
    MAP_WIDTH:"map_width",
    MAP_HEIGHT:"map_height",
    PORTRAIT:"portrait",
    LANDSCAPE:"landscape"
  }

  return values;
});

(function() {
  var support = null;
  try {
    support = 'localStorage' in window && window['localStorage'] !== null;
  } catch (e) {
    support = false;
  }
  controller._supportsLocalStorage = support;
}).bind(this)();

controller.init = (function() {
  controller.map = new esri.Map("map",{
    basemap: "topo",
    center: [-98.6, 39.8],
    slider: true,
    zoom: 2
  });

  controller._on(controller.map, "zoom-end", function(object) {
    controller.zoomLevel = object.level;
  })

  controller._on(controller.map,"load", function () {
    var zoom_slider_left = parseFloat($('#map_zoom_slider').css('left'));
    var zoom_slider_width = parseFloat($('#map_zoom_slider').css('width'));
    $('#div1').css('left',zoom_slider_left * 2 + zoom_slider_width + "px");

    controller.helper = new jQueryHelper(controller.map);
    controller.map.reposition();
    controller.map.resize();

    if (controller.deviceReady == true) {
      controller.startGeolocation();
    } else {
      console.log("L'appareil n'est pas prêt - impossible de démarrer la géolocalisation");
    }

    var supportsOrientationChange = "onorientationchange" in window,
    orientationEvent = supportsOrientationChange ? "orientationchange" : "resize";

    window.addEventListener(orientationEvent, function () {
      controller.rotateScreen(400,true);
    }, false);


    $("div:jqmData(role='page')").on('pagehide',function() {
        controller.viewChange = this.id;
        console.log('view changed ' + controller.map.height + ", " + controller.map.width);
        controller.rotateScreen(400,true);
      });
    });

    controller.map.addLayer(controller._locatorMarkerGraphicsLayer);
  });

  controller.timeoutCurrentPoschange = (function() {
    controller.timeoutCurrentPos = $("#timeout-current-pos").val();
    console.log(controller.timeoutCurrentPos);
  });

  controller.restartGeo = (function restartGeo() {
    var test = confirm("Redémarrer la Geolocalisation ?");
    if (test) {
      var maxAgeCurrentPos = $("#max-age-current-pos").val();
      var timeoutCurrentPos = $("#timeout-current-pos").val();
      var maxAge = $("#max-age-watch-pos").val();
      var timeout = $("#timeout-watch-pos").val();
      if (controller.isNumber(maxAgeCurrentPos) && controller.isNumber(timeoutCurrentPos) &&
        controller.isNumber(maxAge) && controller.isNumber(timeout)) {
        controller.maxAgeCurrentPos = maxAgeCurrentPos;
        controller.timeoutCurrentPos = timeoutCurrentPos;
        controller.timeout = timeout;
        controller.maximumAge = maxAge;
        controller.startGeolocation();
    } else {
      alert("Toutes vos entrées doivent êtres numériques.")
    }
  }
});

  controller.toggleAccumulate = (function(evt) {
    if (evt.target.id == "slider-accumulate-pts" && evt.target.value == "on") {
      controller.accumulate = true;
    } else {
      controller.accumulate = false;
    }
  });

  controller.isNumber = (function(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  });

  controller.showLocation = (function() {
    if ($('#div1').is(':visible') == false || $('#div1').is(':hidden')) {
      $('#div1').show();
    }
    else { 
      $('#div1').hide();
    }
  });

  controller.startGeolocation = function() {

    var _dateStart = new Date();
    var _previousDate = null;

    if (controller._supportsLocalStorage) {
      try {
        localStorage.setItem(controller.localStorageEnum().MAP_WIDTH,$("#map").width());
        localStorage.setItem(controller.localStorageEnum().MAP_HEIGHT,$("#map").height());
        window.innerHeight > window.innerWidth ?
        controller._orientation = controller.localStorageEnum().PORTRAIT :
        controller._orientation = controller.localStorageEnum().LANDSCAPE;
      }
      catch(err) {
        console.log("_supportsLocationStorage: " + err.message);
      }
    }

    try {
      if (navigator.geolocation) {
        console.log("setHighAccuracy = " + controller._setHighAccuracy);

        navigator.geolocation.getCurrentPosition(
          _processGeolocationResult.bind(this)/* use bind() to maintain scope */,
          _html5Error.bind(this),
          {
            maximumAge: controller.maxAgeCurrentPos,
            timeout: controller.timeoutCurrentPos,
            enableHighAccuracy: controller._setHighAccuracy
          }
          );

        controller._watchID = navigator.geolocation.watchPosition(
          _processGeolocationResult.bind(this),
          _html5Error.bind(this),
          {
            timeout: controller.timeout,
            enableHighAccuracy: controller._setHighAccuracy,
            maximumAge: controller.maximumAge
          }
          );
      } else {
        alert("Désolé, votre navigateur ne supporte pas la Géolocalisation");
      }
    } catch(err) {
      console.log("startGeolocation: " + err.message);
    }


    function _processGeolocationResult(position) {

      var html5Lat = position.coords.latitude; 
      var html5Lon = position.coords.longitude; 
      var html5TimeStamp = position.timestamp; 
      var html5Accuracy = position.coords.accuracy;
      var html5Heading = position.coords.heading;
      var html5Speed = position.coords.speed;
      var html5Altitude = position.coords.altitude;

      console.log("success " + html5Lat + ", " + html5Lon);
      $("#geo-indicator").text("Geo: ON");
      $("#geo-indicator").css('color','green');


      controller.helper.setCenterPt(position.coords.latitude,position.coords.longitude,4326);
      controller.helper.setZoom(9);
      controller._displayGeocodedLocation(position);

          if (position.coords.latitude != null && position.coords.longitude != null) {
            if (controller._accuracyDataCSV.length < 50000) {

              var newDateDiff = null;
              var ms = null;
              var dateNow = new Date();
              var totalElapsedTime =  _getTimeDifference(new Date(Math.abs(dateNow.getTime() - _dateStart.getTime())));

              _previousDate == null ?
              newDateDiff = new Date(Math.abs(dateNow.getTime() - _dateStart.getTime())) :
              newDateDiff = new Date(Math.abs(dateNow.getTime() - _previousDate.getTime()));

              _previousDate = new Date();

              var dateResultString = _getTimeDifference(newDateDiff);

              controller._accuracyDataCSV = controller._accuracyDataCSV + Date(html5TimeStamp).toLocaleString() +
              "," + html5Lat +
              "," + html5Lon +
              "," + html5Accuracy +
              "," + controller._setHighAccuracy +
              "," + html5Altitude +
              "," + html5Heading +
              "," + html5Speed +
              "," + position.coords.altitudeAccuracy +
              "," + dateResultString +
              "," + totalElapsedTime +
              ",\r\n";
            }

            if (html5Lat != 0) {
                  controller._mostRecentLocation =  new esri.geometry.Point(html5Lon,html5Lat);
                  controller._showLocation(html5Lat,html5Lon,controller._mostRecentLocation);

                  if (controller._supportsLocalStorage) {
                    localStorage.setItem(controller.localStorageEnum().LAT,html5Lat);
                    localStorage.setItem(controller.localStorageEnum().LON,html5Lon);
                    localStorage.setItem(controller.localStorageEnum().ZOOM_LEVEL,controller.map.getZoom());
                  }
                  console.log('false, ' +
                    localStorage.getItem(controller.localStorageEnum().MAP_WIDTH) + ", " +
                    localStorage.getItem(controller.localStorageEnum().MAP_HEIGHT) + ", " +
                    localStorage.getItem(controller.localStorageEnum().ZOOM_LEVEL) + ", " +
                    this.map.getZoom()
                    );
                }
              }
            }

       function _getTimeDifference(/* Date */ date) {;
        var msec = date;
        var hh = Math.floor(msec / 1000 / 60 / 60);
        msec -= hh * 1000 * 60 * 60;
        var mm = Math.floor(msec / 1000 / 60);
        msec -= mm * 1000 * 60;
        var ss = Math.floor(msec / 1000);
        msec -= ss * 1000;

        hh = hh < 10 ? "0" + hh : hh;
        mm = mm < 10 ? "0" + mm : mm;
        ss = ss < 10 ? "0" + ss : ss;
        msec = msec < 10 ? "0" + msec : msec;

        console.log("time: " + hh + ":" + mm + ":" + ss + ":" + msec);

        return hh + ":" + mm + ":" + ss + ":" + msec;
      }

       function _html5Error(error) {
        var error_value = "null";

        switch(error.code) {
          case 1:
          error_value = "PERMISSION_DENIED";
          $("#slider-geo-on-off").val("off");
          break;
          case 2:
          error_value = "POSITION_UNAVAILABLE";
          break;
          case 3:

                  error_value = "TIMEOUT";
                  break;
                }

                controller.useAlerts == true ?
                alert('There was a problem retrieving your location: ' + error_value) :
                console.log('There was a problem retrieving your location: ' + error_value);
              }

            }

   controller._displayGeocodedLocation = function(position) {
    var altitude = "n/a";
    if (position.coords.altitude != null) altitude = position.coords.altitude.toFixed(2) + "m";
    var speed = "n/a";
    if (position.coords.speed != null) (position.coords.speed * 3600 / 1000).toFixed(2) + "km/hr";
    var heading = "n/a";
    if (position.coords.heading != null) position.coords.heading.toFixed(2) + "deg";

    $("#location").text(position.coords.latitude.toFixed(4) + ", " + position.coords.longitude.toFixed(4));
    $("#altitude").text("Alt: " + altitude);
    $("#speed").text("Spd: " + speed);
    $("#heading").text("Hdg: " + heading);

      var date = new Date(position.timestamp)
      $("#timestamp").text(date.toLocaleString());
      $("#accuracy").text("Acc: " + position.coords.accuracy.toFixed(2) + "m");

    }

    controller._showLocation = function(myLat, myLong, geometry) {

      var myPositionSymbol = null;
      var locatorSymbol = null;

      if (window.devicePixelRatio >= 2) {
  locatorSymbol = controller._locatorMarkerLarge;
}
else {
  locatorSymbol = controller._locatorMarkerSmall;
}

      controller.map.graphics.clear();
      controller.map.graphics.add(new esri.Graphic(geometry, controller.markerSymbol));
      controller.map.centerAndZoom(geometry, controller.zoomLevel);

      if (controller.accumulate == true)controller._locatorMarkerGraphicsLayer.add(new esri.Graphic(geometry, locatorSymbol));

    };

    controller.setHighAccuracy = function(value) {
      controller.stopGeolocation();
      controller._setHighAccuracy = value;
      controller.restartGeo();
    }

   controller.stopGeolocation = (function() {
    try {
      navigator.geolocation.clearWatch(controller._watchID);
      controller._watchID = null;
      $("#geo-indicator").text("Geo: OFF");
      $("#geo-indicator").css('color','red');
    }
    catch(err) {
      console.log("stopGeolocation error: " + err.toString());
    }
  });

  controller.rotateScreen = (function(value, useLocalStore) {
    if (typeof useLocalStore == 'undefined') useLocalStore = false;

    console.log('rotateScreen, ' +
      localStorage.getItem(controller.localStorageEnum().MAP_WIDTH) + ", " +
      localStorage.getItem(controller.localStorageEnum().MAP_HEIGHT) + ", " +
      localStorage.getItem(controller.localStorageEnum().ZOOM_LEVEL));

    try {
      if (controller.viewChange == null || controller.viewChange == "settings") {

        var timeout = null;
        value != "undefined" ? timeout = value : timeout = 500;
        setTimeout((function() {
          if (controller.map != null && controller._mostRecentLocation != null) {

                      if (controller.map.height == 0 || controller.map.width == 0) {
                        if (useLocalStore == false) {
                          if (controller._orientation == controller.localStorageEnum().PORTRAIT)
                          {
                            controller.map.width = localStorage.getItem(controller.localStorageEnum().MAP_WIDTH);
                            controller.map.height = localStorage.getItem(controller.localStorageEnum().MAP_HEIGHT);
                          }
                          else {
                            controller.map.width = localStorage.getItem(controller.localStorageEnum().MAP_HEIGHT);
                            controller.map.height = localStorage.getItem(controller.localStorageEnum().MAP_WIDTH);
                          }

                          controller.map.resize();
                          controller.map.reposition();
  

                              var wgsPt = new esri.geometry.Point(
                                localStorage.getItem(controller.localStorageEnum().LON),
                                localStorage.getItem(controller.localStorageEnum().LAT), new esri.SpatialReference({ wkid: 4326 }))

                              controller.map.centerAndZoom(
                                esri.geometry.geographicToWebMercator(wgsPt),
                                localStorage.getItem(controller.localStorageEnum().ZOOM_LEVEL)
                                );
                            }
                          }
                          else {
                            controller.map.resize();
                            controller.map.reposition();

                            if (useLocalStore == false) {
                              var wgsPt = new esri.geometry.Point(
                                localStorage.getItem(controller.localStorageEnum().LON),
                                localStorage.getItem(controller.localStorageEnum().LAT)
                                );
                              controller.map.centerAndZoom(esri.geometry.geographicToWebMercator(wgsPt), controller.zoomLevel);
                            }
                          }
                        }

                      }).bind(this),timeout);
      }
    }
    catch(err) {
      console.log("rotateScreen() error " + err.message);
    }

  });

   controller.utils.getAccuracyCSV = (function() {
    return controller._accuracyDataCSV;
  });

   controller.utils.sendEmail = (function() {
    window.open('mailto:'+ controller._MAIL_TO_ADDRESS +'?subject=HTML5 Accuracy Data&body=' +
      encodeURIComponent(controller.utils.getAccuracyCSV()));
  });

   require([
    "esri/map",
    "esri/symbols/PictureMarkerSymbol",
    "esri/graphic",
    "esri/geometry/Point",
    "dojo/_base/Color",
    "dojo/on"],
    function(Map,PictureMarkerSymbol,Graphic,Point,Color,on) {
      controller._on = on;
      controller._MAIL_TO_ADDRESS = "your_email_address_goes_here";
      controller._supportsLocalStorage = false;
      controller._watchID = null;
      controller._setHighAccuracy = true;
      controller._mostRecentLocation = null;
      controller._accuracyDataCSV = "Date,Lat,Long,Accuracy,High_accuracy_boolean,Altitude,Heading,Speed,Altitude_accuracy,Interval_time,Total_elapsed_time,\r\n";
      controller._pushPinLarge = new esri.symbol.PictureMarkerSymbol("images/pushpin104x108.png", 104, 108);
      controller._pushPinSmall = new esri.symbol.PictureMarkerSymbol("images/pushpin52x54.png", 48, 48);
      controller._locatorMarkerLarge = new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE,
        10,
        new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new Color([0,0,0]), 1),
        new Color([255,255,0,0.5]));

      controller._locatorMarkerSmall = new esri.symbol.SimpleMarkerSymbol(esri.symbol.SimpleMarkerSymbol.STYLE_CIRCLE,
        5,
        new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new Color([0,0,0]), 0.5),
        new Color([255,255,0,0.5]));
      controller._locatorMarkerGraphicsLayer = new esri.layers.GraphicsLayer();

      controller.markerSymbol = new PictureMarkerSymbol({
        "angle":0,
        "xoffset":0,
        "yoffset":13,
        "type":"esriPMS",
        "url":"images/green-pin.png",
        "width":35,
        "height":35
      });
      controller.init();
    });