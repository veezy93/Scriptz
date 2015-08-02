(function(window, document, undefined) {
  var catstats = window.catstats = (function(catstats) {

    var readCookie = function readCookie(name) {
      var nameEQ = name + "=";
      var ca = document.cookie.split(';');
      for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
      }
      return null;
    }

    var writeCookie = function writeCookie(cookie) {
      var cookieExpirationDate = new Date();
      cookieExpirationDate.setYear(cookieExpirationDate.getYear() + 1);
      cookieExpirationDate = cookieExpirationDate.toGMTString();

      var cookieDomain = (function() {
        var s = document.domain.toString();
        return s.substring(s.indexOf("."));
      })();

      document.cookie = cookie.toString() + ";" + "domain=" + cookieDomain + ";" + "expires=" + cookieExpirationDate;
    }

    catstats.downloaded = false;
    catstats.players = {};
    catstats.score = {redTeam: 0, blueTeam: 0};
    catstats.columns = ['name', 'plusminus', 'minutes', 'score', 'tags', 'pops',
    'grabs', 'drops', 'hold', 'captures', 'prevent', 'returns',
    'support', 'team', 'powerups', 'team captures', 'opponent captures',
    'arrival', 'departure', 'bombtime', 'tagprotime', 'griptime',
    'speedtime'];



    catstats.init = function init() {
      if (window.tagpro && tagpro.socket && window.jQuery)
        return this.setup();
      setTimeout(this.init, 0);
    }

    var tsvCookieName = "save_as_tsv_status";
    var linkId = "saveAsTSVLink";
    var teamNamesId = "teamsForSheet";

    var tsvSavePrompt = "Save as .tsv";

    catstats.setup = function setup() {
      var _this = this;

      $(document).ready(function() {
        var currentStatusString = readCookie(tsvCookieName);
        var currentStatus;

        if (currentStatusString == null) {
          currentStatus = false;
        } else {
          currentStatusString = currentStatusString.toLowerCase();
          currentStatus = (currentStatusString === "true");
        }

        catstats.wantsStats = currentStatus;

        var $checkbox = $("<input>", { type: "checkbox", id: linkId, checked: currentStatus })
        .css("cursor", "pointer")
        .click(function() { _this.registerExport.call(_this); });

        var $label = $('<label />').html(tsvSavePrompt)
        .css("cursor", "pointer");
        $label.prepend($checkbox);
        
        var $teamsForSheet = $('<input>', { type: "text", id: teamNamesId });
        var $inputPrompt = $('<label />').html('Sheet Name: ');
        $inputPrompt.css('margin-left: 10px');
        $teamsForSheet.css('margin-left: 2px');
        //$teamsForSheet.prepend('<label id="inputPrompt">Sheet Name: </label>');
        $label.append($inputPrompt);
        $inputPrompt.append($teamsForSheet);
        

        var $el = $('#optionsName');
        $label.insertBefore($el);
      });

        // Listen for player updates
        tagpro.socket.on('p', function(data) { _this.onPlayerUpdate.call(_this, data); });
        // Listen for score updates
        tagpro.socket.on('score', function(data) { _this.onScoreUpdate.call(_this, data); });
        // Listen for player quits
        tagpro.socket.on('playerLeft', function(data) { _this.onPlayerLeftUpdate.call(_this, data); });
        // Listen for time and game state changes
        tagpro.socket.on('time', function(data) { _this.onTimeUpdate.call(_this, data); });

        // Listen for end game and attempt download
        tagpro.socket.on('end', function() { _this.onEnd.call(_this); });
        // Before leaving the page attempt download
        window.addEventListener('beforeunload', function() { _this.onEnd.call(_this); });

      };


    /**
     * Update local player stats
     * @param {Object} data The 'p' update data
     */
    catstats.onPlayerUpdate = function onPlayerUpdate(data) {
      // Sometimes data is in .u
      data = data.u || data;

      var _this = this;

      // Loop over all the player updates
      // and update each player in
      // the local player record
      data.forEach(function(playerUpdate) {
        var player = _this.players[playerUpdate.id];

        if (!player) {
          player = _this.createPlayer(playerUpdate.id);
          _this.updatePlayer(player, tagpro.players[playerUpdate.id]);
        } else {
          _this.updatePlayer(player, playerUpdate);
        }
        
      });
    };


    /**
    * Update the team score
    * @param {Object} data - The 'score' update data
    */
    catstats.onScoreUpdate = function onScoreUpdate(data) {
      this.score.redTeam = data.r;
      this.score.blueTeam = data.b;
    };


    /**
     * Handle players who leave early
     * @param {Number} playerId - The id of the player leaving
     */
    catstats.onPlayerLeftUpdate = function onPlayerLeftUpdate(playerId) {
      // Player leaves mid-game
      if(tagpro.state == 1) {
        this.updatePlayerAfterDeparture(this.players[playerId]);
      }

      // Player leaves before the game
      if(tagpro.state == 3) {
        delete this.players[playerId];
      }

      // Ignore all other player's leaving
    };


    /**
     * Track the amount of time a player is in the game
     * @param {Object} data - The time object
     */
    catstats.onTimeUpdate = function onTimeUpdate(data) {
      if(tagpro.state == 2) return; //Probably unneeded
      var playerIds = Object.keys(this.players);
      var _this = this;
      playerIds.forEach(function(id) {
        _this.players[id]['arrival'] = data.time;
      });
    };


    /**
     * Called when the game has ended or
     * the client is leaving the page
     */
    catstats.onEnd = function onEnd() {
       if(this.wantsStats && !this.downloaded) {
         if ($('#teamNamesId').val().length > 0) {
           alert($('#teamNamesId').val());
         } else {
           var retVal = prompt("Enter the name of the sheet: ", "(teams)");
           alert("You have entered : " +  retVal );
         }
         this.exportStats();
       }
     }

    /**
     * Prepare the local player record for export
     */
    catstats.prepareStats = function prepareStats() {
      var now = Date.now();
      var _this = this;
      var stats = Object.keys(this.players).map(function(id) {
        var player = _this.players[id];
        _this.updatePlayerAfterDeparture(player, now);

        // Record every column for the spreadsheet
        var columns = {};
        columns['name']        = player['name'] || '';
        columns['minutes']     = player['minutes'] || 0;
        columns['score']       = player['score'] || 0;
        columns['tags']        = player['s-tags'] || 0;
        columns['pops']        = player['s-pops'] || 0;
        columns['grabs']       = player['s-grabs'] || 0;
        columns['drops']       = player['s-drops'] || 0;
        columns['hold']        = player['s-hold'] || 0;
        columns['captures']    = player['s-captures'] || 0;
        columns['prevent']     = player['s-prevent'] || 0;
        columns['returns']     = player['s-returns'] || 0;
        columns['support']     = player['s-support'] || 0;
        columns['team']        = player.team || 0;
        columns['powerups']    = player['s-powerups'] || 0;
        columns['team captures']     = player.team == 1 ? tagpro.score.r : tagpro.score.b;
        columns['opponent captures'] =  player.team == 1 ? tagpro.score.b : tagpro.score.r;
        columns['plusminus']   = columns['team captures'] - columns['opponent captures'] || 0;
        columns['arrival']     = player['arrival'] || 0;
        columns['departure']   = player['departure'] || 0;
        columns['bombtime']    = player['bombtime'] || 0;
        columns['tagprotime']  = player['tagprotime'] || 0;
        columns['griptime']    = player['griptime'] || 0;
        columns['speedtime']   = player['speedtime'] || 0;
        return columns;
      });
      return stats;
    }


    /**
     * Called when the player wants to export the statsboard
     * This can be called at anytime during the game and the stats
     * will be saved before leaving the page
     */
    catstats.registerExport = function registerExport() {
      this.wantsStats = $("#" + linkId).is(":checked") ? true : false;
      writeCookie(tsvCookieName + "=" + this.wantsStats);
      if (this.wantsStats && tagpro.state == 2) {
        this.exportStats();
      }
    };

    /**
     * Create a local player record
     * @param {Number} id - the id of the player
     */
    catstats.createPlayer = function createPlayer(id) {
      var player = this.players[id] = {};
      player['arrival']     = tagpro.gameEndsAt - Date.now();
      player['bombtime']    = 0;
      player['tagprotime']  = 0;
      player['griptime']    = 0;
      player['speedtime']   = 0;
      player['bombtr']      = false;
      player['tagprotr']    = false;
      player['griptr']      = false;
      player['speedtr']     = false;
      player['diftotal']    = 0;
      return player;
    };


    /**
     * Update the local player record with new data
     * @param {Object} player - reference to local player record
     * @param {Object} playerUpdate - new player data
     */
    catstats.updatePlayer = function updatePlayer(player, playerUpdate) {
      var attrs = Object.keys(playerUpdate);
      var _this = this;
      attrs.forEach(function(attr) {
        var data = playerUpdate[attr];

        // if this is a powerup - update time tracking
        if(attr === 'bomb' || attr === 'tagpro' || attr === 'speed' || attr === 'grip') {
          _this.updatePlayerTimer(player, attr, data);
        }

        // update the local player record with new data
        if(typeof data !== 'object') {
          player[attr] = data;
        }
      });
    };


    /**
     * Update timers on the local player record
     * @param {Object} player - reference to local player record
     * @param {Object} timerName - name of the timer to update
     * @param {Object} timerValue - value of the timer to update
     */
    catstats.updatePlayerTimer = function updatePlayerTimer(player, timerName, timerValue) {
      // the player has the powerup and
      // we aren't tracking the time yet
      if(timerValue === true && !player[timerName+'tr']) {
        player[timerName+'tr'] = true;
        player[timerName+'start'] = Date.now();
        return;
      }

      // player lost the powerup, save the time
      if(timerValue === false && player[timerName+'tr'] === true) {
        player[timerName+'tr'] = false;
        player[timerName+'time'] += Date.now() - player[timerName+'start'];
        return;
      }
    }

    /**
     * When a player leaves or the game is over perform some cleanup
     * @param {Object} player - reference to local player record
     * @param {Number} [now] - unix timestamp representing current time
     */
    catstats.updatePlayerAfterDeparture = function updatePlayerAfterDeparture (player, now) {
      var now = now || Date.now();

      // ignore players who have already departed
      if(player['departure'] !== undefined)
        return;

      player['departure'] = tagpro.gameEndsAt - now;

      // Record the minutes played
      var seconds  = (player['arrival'] - player['departure']) / 1e3;
      player['minutes'] = Math.round(seconds/60);

      var _this = this;
      // Update all timers
      ['bomb', 'tagpro', 'grip', 'speed'].forEach(function(timerName) {
        _this.updatePlayerTimer(player, timerName, false);
      });
    }

    /**
     * Create the document and trigger a download
     */
    catstats.exportStats = function exportStats() {
      var teams = tagpro.teamNames ? tagpro.teamNames.redTeamName + "-vs-" + tagpro.teamNames.blueTeamName + "-" : "";
      saveAs(
        new Blob(
          [this.tsv(this.prepareStats())],
          {type: "data:text/tsv;charset=utf-8"}
          ),
        "tagpro-"+teams+Date.now()+".tsv"
        );
      this.downloaded = true;
    }

    /** 
     *  Create a string of tab separated values
     *  from the player data in the column order
     *  specified by the global `columns`
     *  @param {Array} players - data to convert to tsv
     *  @returns {String} contents of a tsv file
     */
    catstats.tsv = function tsv(players) {
      var result = '';
      var _this = this;
      players.forEach(function(player, i) {
        // write header
        if(i == 0)
          result = _this.columns.join('\t') + '\r\n';

        // write row
        result += _this.columns.map(function(c) {
          return player[c];
        }).join('\t') + '\r\n';

      });
      return result;
    }

    return catstats;
  }({}));

  window.tagpro.ready(function() { window.catstats.init(); });
})(window, document);
