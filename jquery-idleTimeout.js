/**
 * This work is licensed under the Creative Commons Attribution-Share Alike 3.0
 * United States License. To view a copy of this license,
 * visit http://creativecommons.org/licenses/by-sa/3.0/us/ or send a letter
 * to Creative Commons, 171 Second Street, Suite 300, San Francisco, California, 94105, USA.
 *
 * Modified by: Jill Elaine
 * Email: jillelaine01@gmail.com
 * https://github.com/JillElaine/jquery-idleTimeout/wiki
 * Configurable idle (no activity) timer and logout redirect for jQuery.
 * Works across multiple windows and tabs from the same domain.
 *
 * Dependencies: JQuery v1.7+, JQuery UI,  $.jStorage.js
 *
 * version 1.0.11
 **/

/*global jQuery: false, document: false,  $.jStorage: false, clearInterval: false, setInterval: false, setTimeout: false, clearTimeout: false, window: false, alert: false*/
/*jslint indent: 2, sloppy: true, plusplus: true*/

(function ($) {
    $.fn.idleTimeout = function (userRuntimeConfig) {
        //##############################
        //## Public Configuration Variables
        //##############################
        var defaultConfig = {
            redirectUrl: '/',      // redirect to this url on logout. Set to "redirectUrl: false" to disable redirect

            // idle settings
            idleTimeLimit: 1200,           // 'No activity' time limit in seconds. 1200 = 20 Minutes
            idleCheckHeartbeat: 1,       // Frequency to check for idle timeouts in seconds

            // optional custom callback to perform before logout
            customCallbackFlag: true,       // set to false for no customCallback
            customCallback: function () {    // define optional custom js function
                // perform custom action before logout
            },

            // configure which activity events to detect
            // http://www.quirksmode.org/dom/events/
            // https://developer.mozilla.org/en-US/docs/Web/Reference/Events
            activityEvents: 'click keypress scroll wheel mousewheel mousemove touchmove', // separate each event with a space
            // warning dialog box configuration
            enableDialog: true,           // set to false for logout without warning dialog
            dialogDisplayLimit: 180,       // Time to display the warning dialog before logout (and optional callback) in seconds. 180 = 3 Minutes
            dialogTitle: 'Session Expiration Warning', // also displays on browser title bar
            dialogText: 'Because you have been inactive, your session is about to expire.',
            dialogTimeRemaining: 'Time remaining',
            dialogStayLoggedInButton: 'Stay Logged In',
            dialogLogOutNowButton: 'Log Out Now',

            // error message if https://github.com/marcuswestin/ $.jStorage.js not enabled
            errorAlertMessage: 'Please disable "Private Mode", or upgrade to a modern browser',

            // server-side session keep-alive timer - can ping endpoint to refresh session and keep alive
            sessionKeepAliveTimer: false,   // ping the server at this interval in seconds. 600 = 10 Minutes. Set to false to disable pings
            sessionKeepAliveUrl: window.location.href // set URL to ping - does not apply if sessionKeepAliveTimer: false
        },

        //##############################
        //## Private Variables
        //##############################
          currentConfig = $.extend(defaultConfig, userRuntimeConfig), // merge default and user runtime configuration
          origTitle = document.title, // save original browser title
          activityDetector,
          startKeepSessionAlive, stopKeepSessionAlive, keepSession, keepAlivePing, // session keep alive
          idleTimer, remainingTimer, checkIdleTimeout, checkIdleTimeoutLoop, startIdleTimer, stopIdleTimer, // idle timer
          openWarningDialog, launchTimeoutModal, dialogTimer, checkDialogTimeout, startDialogTimer, stopDialogTimer, isDialogOpen, destroyWarningDialog, countdownDisplay, // warning dialog
          logoutUser;

        //##############################
        //## Listeners - crosstab dependency
        //##############################

        crosstab.on('SessionIsTimingOutInTab', function (response) {
            var crosstabId = crosstab.id;

            if (crosstabId !== response.data.SessionTimeoutInitiatorTabId) { }

            if (!sessionStorage.getItem("SessionTimeoutActive")) { //Check modal not active in this tab context
                appMain.closeAllqTips(); //close any open qtips
                launchTimeoutModal();
            }

            //if (!sessionStorage.getItem("SessionTimeoutActive")) {//Check not active in this tab context
            //    if (isDialogOpen()) {
            //        $.featherlight.close(); //close any open, non timeout modals
            //    }
            //    appMain.closeAllqTips(); //close any open qtips
            //    launchTimeoutModal();
            //}
        });

        crosstab.on('SessionIsResumed', function (response) {
            Vault.deleteSessionItem("SessionTimeoutActive");
            //Vault.setItem("SessionKeepAlive", moment().valueOf());
            stopDialogTimer();
            startIdleTimer();
            $.featherlight.close();
        });

        //$.jStorage.listenKeyChange("SessionKeepAlive", function (key, action) { //Kill modal session is maintained.
        //    if (Vault.getItem("SessionKeepAlive")) { //TODO: REFRESH TOKEN
        //        if (sessionStorage.getItem("SessionTimeoutActive")) sessionStorage.removeItem("SessionTimeoutActive");
        //        stopDialogTimer();
        //        startIdleTimer();
        //        $.featherlight.close();
        //        //Vault.deleteItem("SessionKeepAlive");
        //    }
        //});

        //Reset by default on load / refresh
        //if (sessionStorage.getItem("SessionTimeoutActive")) {
        //    sessionStorage.removeItem("SessionTimeoutActive"); //Kill session key for active tabs on window open / reload
        //    Vault.setItem("SessionKeepAlive", moment().valueOf());
        //}

        //$.jStorage.listenKeyChange("SessionTimeoutWarning", function (key, action) {
        //    if (!sessionStorage.getItem("SessionTimeoutActive")) {//Check not active in this tab context
        //        if (isDialogOpen()) {
        //            $.featherlight.close(); //close any open, non timeout modals
        //        }
        //        appMain.closeAllqTips(); //close any open qtips
        //        launchTimeoutModal();
        //    }
        //});

        //$.jStorage.listenKeyChange("SessionKeepAlive", function (key, action) { //Kill modal session is maintained.
        //    if (Vault.getItem("SessionKeepAlive")) { //TODO: REFRESH TOKEN
        //        if (sessionStorage.getItem("SessionTimeoutActive")) sessionStorage.removeItem("SessionTimeoutActive");
        //        stopDialogTimer();
        //        startIdleTimer();
        //        $.featherlight.close();
        //        //Vault.deleteItem("SessionKeepAlive");
        //    }
        //});

        //##############################
        //## Public Functions
        //##############################
        // trigger a manual user logout
        // use this code snippet on your site's Logout button: $.fn.idleTimeout().logout();
        this.logout = function () {
        };

        //##############################
        //## Private Functions
        //##############################

        //----------- KEEP SESSION ALIVE FUNCTIONS --------------//
        startKeepSessionAlive = function () {
            keepSession = function () {
                $.get(currentConfig.sessionKeepAliveUrl);
                startKeepSessionAlive();
            };

            keepAlivePing = setTimeout(keepSession, (currentConfig.sessionKeepAliveTimer * 1000));
        };

        stopKeepSessionAlive = function () {
            clearTimeout(keepAlivePing);
        };

        //----------- ACTIVITY DETECTION FUNCTION --------------//
        activityDetector = function () {
            $(document, ".js-appModal-wrapper").on(currentConfig.activityEvents, function () {
                if (!currentConfig.enableDialog || (currentConfig.enableDialog && isDialogOpen() !== true)) {
                    startIdleTimer();
                }
            });
        };
        //----------- IDLE TIMER FUNCTIONS --------------//
        checkIdleTimeout = function () {
            $.when(appMain.isUserLoggedIn().then(function (isUserLoggedInResult) {
                // var timeIdleTimeout = ($.jStorage.get('IdleTimerLastActivity') + (currentConfig.idleTimeLimit * 1000));
                var timeIdleTimeout = moment($.jStorage.get('IdleTimerLastActivity')).add(currentConfig.idleTimeLimit, "seconds");
                var now = moment.utc().valueOf();

                if (isUserLoggedInResult) { //User is logged In
                    //if ($.now() > timeIdleTimeout) {
                    if (moment(now).isAfter(timeIdleTimeout)) {
                        if (!currentConfig.enableDialog) { // warning dialog is disabled
                            logoutUser(); // immediately log out user when user is idle for idleTimeLimit
                        } else if (currentConfig.enableDialog) {
                            openWarningDialog();
                            startDialogTimer(); // start timing the warning dialog
                        }
                    } else { //Time not expires
                        if (currentConfig.enableDialog && isDialogOpen() === true) {
                            destroyWarningDialog();
                            stopDialogTimer();
                        }
                    }
                } else {
                    window.location.href = "/#/SignIn";
                }
            }));
        };

        startIdleTimer = function () {
            stopIdleTimer();
            $.jStorage.set('IdleTimerLastActivity', moment.utc().valueOf());
            checkIdleTimeoutLoop();
        };

        checkIdleTimeoutLoop = function () {
            checkIdleTimeout();
            idleTimer = setTimeout(checkIdleTimeoutLoop, (currentConfig.idleCheckHeartbeat * 1000));
        };

        stopIdleTimer = function () {
            clearTimeout(idleTimer);
        };

        //----------- WARNING DIALOG FUNCTIONS --------------//
        openWarningDialog = function () {
            //Broadcast to all session tabs to open the timeout countdown
            var crossTabId = crosstab.id;
            crosstab.broadcast("SessionIsTimingOutInTab", {
                SessionTimeoutInitiatorTabId: crossTabId
            });
        };

        launchTimeoutModal = function () {
            Vault.setSessionItem("SessionTimeoutActive", true);

            GetHandlebarsTemplate.callApi("Content/js/handlebarsTemplates/appLogOut__modal.htm", null, null).done(function (html) {
                $.featherlight(html, {
                    closeOnEsc: false,
                    closeOnClick: false,
                    closeIcon: "",
                    closeSpeed: 0,
                    type: "html",
                    beforeOpen: function (e) {
                        $.proxy($.featherlight.defaults.beforeOpen, this, e)();
                    },
                    beforeClose: function (e) {
                        $.proxy($.featherlight.defaults.beforeClose, this, e)();
                    },
                    afterContent: function (e) {
                        $.proxy($.featherlight.defaults.afterContent, this, e)();
                        countdownDisplay();
                        $(".js-appLogOutTimerModal-logOut-btn").unbind().on("click", appMain.userLogOut);
                        $(".js-appLogOutTimerModal-stayLoggedIn-btn").unbind().on("click", function () {//Tell all tabs to keep alive
                            var crossTabId = crosstab.id;
                            crosstab.broadcast("SessionIsResumed", {
                                SessionIsResumedInTabId: crossTabId
                            });
                        });
                    }
                });
            });

            if (currentConfig.sessionKeepAliveTimer) {
                stopKeepSessionAlive();
            }
        };

        checkDialogTimeout = function () {
            //var timeDialogTimeout = ($.jStorage.get('IdleTimerLastActivity') + (currentConfig.idleTimeLimit * 1000) + (currentConfig.dialogDisplayLimit * 1000));
            var timeDialogTimeout = moment($.jStorage.get('IdleTimerLastActivity')).add(currentConfig.idleTimeLimit, "seconds").add(currentConfig.dialogDisplayLimit, "seconds") + 1;
            var now = moment().utc().valueOf();
            //if (($.now() > timeDialogTimeout) || ($.jStorage.get('idleTimerLoggedOut') === true)) {
            //    logoutUser();
            //}

            if (moment(now).isAfter(timeDialogTimeout)) {
                logoutUser();
            }
        };

        startDialogTimer = function () {
            dialogTimer = setInterval(checkDialogTimeout, (currentConfig.idleCheckHeartbeat * 1000));
        };

        stopDialogTimer = function () {
            clearInterval(dialogTimer);
            clearInterval(remainingTimer);
        };

        isDialogOpen = function () {
            return !!$.featherlight.current();
        };

        destroyWarningDialog = function () {
            if (currentConfig.sessionKeepAliveTimer) {
                startKeepSessionAlive();
            }
        };

        countdownDisplay = function () {
            var dialogDisplaySeconds = currentConfig.dialogDisplayLimit, mins, secs;
            $('.js-countdownDisplay').text("00:" + dialogDisplaySeconds); //Set default on launch
            remainingTimer = setInterval(function () {
                mins = Math.floor(dialogDisplaySeconds / 60); // minutes
                if (mins < 10) { mins = '0' + mins; }
                secs = dialogDisplaySeconds - (mins * 60); // seconds
                if (secs < 10) { secs = '0' + secs; }
                $('.js-countdownDisplay').text(mins + ':' + secs);
                dialogDisplaySeconds -= 1;
            }, 1000);
        };

        //----------- LOGOUT USER FUNCTION --------------//
        logoutUser = function () {
            $.when(appMain.isUserLoggedIn().done(function (loggedIn) {
                if (loggedIn) {
                    appMain.userLogOut();
                } else {
                    return;
                }
            }));

            //$.jStorage.set('idleTimerLoggedOut', true);

            //if (currentConfig.sessionKeepAliveTimer) {
            //    stopKeepSessionAlive();
            //}

            //if (currentConfig.customCallbackFlag) {
            //    currentConfig.customCallback();
            //}

            //if (currentConfig.redirectUrl) {
            //    window.location.href = currentConfig.redirectUrl;
            //}
        };

        //###############################
        // Build & Return the instance of the item as a plugin
        // This is your construct.
        //###############################
        return this.each(function () {
            $.when(appMain.isUserLoggedIn().done(function (loggedIn) { //Only if logged on (should be called after authentication by app)
                if ($.jStorage.storageAvailable() && loggedIn) {
                    $.jStorage.set('IdleTimerLastActivity', moment.utc().valueOf());
                    // $.jStorage.set('idleTimerLoggedOut', false);

                    activityDetector();

                    if (currentConfig.sessionKeepAliveTimer) {
                        startKeepSessionAlive();
                    }

                    startIdleTimer();
                } else {
                    window.location = "/"; //Hard redirct, reset Application
                    // alert(currentConfig.errorAlertMessage);
                }
            }));
        });
    };
}(jQuery, $.jStorage));
