import React, {useEffect, useState} from 'react';
import get from 'just-safe-get';
import {styled} from 'baseui';

import {Scrubber} from "react-scrubber";
import 'react-scrubber/lib/scrubber.css';

import {Tabs, Tab} from 'baseui/tabs-motion';

const es = new EventSource("/sse");

const useAnimationFrame = callback => {
    // Use useRef for mutable variables that we want to persist
    // without triggering a re-render on their change
    const requestRef = React.useRef();
    const previousTimeRef = React.useRef();

    const animate = time => {
        if (previousTimeRef.current !== undefined) {
            const deltaTime = time - previousTimeRef.current;
            callback(deltaTime)
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    });
}

const PlayControls = styled('div', {
    marginRight: '1em',
})

const AlbumInfoContainer = styled('div', {
    display: 'flex'
})

const SongMetadataContainer = styled('div', {
    marginLeft: '1em',
})

const TrackTime = styled('div', {
    marginTop: '0.5em',
    marginRight: 0,
    marginBottom: '0.5em',
    marginLeft: 0,
})

const VolumeScrubberContainer = styled('div', {
    float: 'right',
    height: '5em',
    width: '1em'
})

function secondsToMMSS(seconds) {
    if (isNaN(seconds)) {
        return '--:--';
    }
    return new Date(seconds * 1000).toISOString().substr(14, 5)
}

function HEOS() {
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState({});
  const [activeKey, setActiveKey] = React.useState("0");

    useEffect(() => {
      es.onmessage = function (event) {
          setMessages([
              ...messages,
              event.data
          ])

          const data = JSON.parse(event.data);
          const commandGroup = get(data, 'heos.command.commandGroup')
          const command = get(data, 'heos.command.command')
          if (commandGroup === "player" && command === "get_players") {
              setPlayers(data.payload.reduce((playersObj, player) => {
                  playersObj[player.pid] = player;
                  return playersObj;
              }, {}))
              if (localStorage.getItem('activePlayerPid') !== null) {
                  setActiveKey(localStorage.getItem('activePlayerPid'))
              } else {
                  setActiveKey(data.payload[0].pid)
              }
          }
          if (commandGroup === "player" && command === "get_now_playing_media") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying = {
                  ...updatedPlayers[data.heos.message.parsed.pid].nowPlaying,
                  ...data.payload
              };
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "player" && command === "get_play_state") {
              const updatedPlayers = {...players};
              if (!updatedPlayers[data.heos.message.parsed.pid].nowPlaying) {
                  updatedPlayers[data.heos.message.parsed.pid].nowPlaying = {
                      pid: data.heos.message.parsed.pid
                  };
              }
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying.state = data.heos.message.parsed.state;
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "player" && command === "get_volume") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying.volume = data.heos.message.parsed.level;
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "event" && command === "player_now_playing_changed") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying = {
                  ...updatedPlayers[data.heos.message.parsed.pid].nowPlaying,
                  ...data.heos.message.parsed
              };
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "event" && command === "player_now_playing_progress") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying = {
                  ...updatedPlayers[data.heos.message.parsed.pid].nowPlaying,
                  ...data.heos.message.parsed
              };
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "event" && command === "player_state_changed") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying.state = data.heos.message.parsed.state;
              setPlayers(updatedPlayers)
          }
          if (commandGroup === "event" && command === "player_volume_changed") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying.volume = data.heos.message.parsed.level;
              setPlayers(updatedPlayers)
          }
      };
  })

  return (
      <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => {
              setActiveKey(activeKey);
              localStorage.setItem('activePlayerPid', activeKey)
          }}
          activateOnFocus
      >
          {Object.values(players).map((player) => {
              return (<Tab key={player.pid} title={player.name}><PlayerInfo player={player} /></Tab>)
          })}
      </Tabs>
  );
}

function SongMetadata({nowPlaying}) {
    return (
        <SongMetadataContainer>
            <strong>{nowPlaying.song}</strong><br />
            {nowPlaying.artist} · {nowPlaying.album}
        </SongMetadataContainer>
    );
}

function nextTrack(pid) {
    fetch(`next?pid=${pid}`)
}

function previousTrack(pid) {
    fetch(`previous?pid=${pid}`)
}

function pauseTrack(pid) {
    fetch(`pause?pid=${pid}`)
}

function playTrack(pid) {
    fetch(`play?pid=${pid}`)
}

function setPlayerVolume(pid, level) {
    fetch(`set_volume?pid=${pid}&level=${level}`)
}

function Position({nowPlaying}) {
    const [playState, setPlayState] = React.useState()
    const [isScrubbing, setIsScrubbing] = React.useState(false)
    const [position, setPosition] = React.useState(null)
    const duration = nowPlaying.duration/1000 || 0
    if (!isScrubbing) {
        if (position === null && nowPlaying.cur_pos !== 0) {
            setPosition(nowPlaying.cur_pos / 1000)
        }
        if (nowPlaying.cur_pos && Math.abs(nowPlaying.cur_pos / 1000 - position) > 10) {
            setPosition(nowPlaying.cur_pos / 1000)
        }
        if (nowPlaying.state && nowPlaying.state !== playState) {
            setPlayState(nowPlaying.state)
            setPosition(nowPlaying.cur_pos / 1000)
        }
    }

    useAnimationFrame(deltaTime => {
        // Pass on a function to the setter of the state
        // to make sure we always have the latest state
        if (!isScrubbing && playState !== "pause") {
            setPosition((prevPosition) => {
                if (!prevPosition) {
                    return null
                }
                const newTime = prevPosition + deltaTime/1000
                return newTime
            })
        }
    }, [isScrubbing, playState])

    if (!nowPlaying.duration) {
        // return null;
    }

    function handleScrubStart(value) {
        setIsScrubbing(true)
    }

    function handleScrubChange(value) {
        setIsScrubbing(true)
        setPosition(value)
    }

    function handleScrubEnd(value) {
        setIsScrubbing(false)
    }

    return (
        <>
            <div style={{display: 'flex'}}>
                <PlayControls>
                    <a href="#" onClick={(evt) => {evt.preventDefault(); previousTrack(nowPlaying.pid);}}>⏮️️</a>
                    {playState === "play" && <a href="#" onClick={(evt) => {evt.preventDefault(); pauseTrack(nowPlaying.pid);}}>⏸</a>}
                    {(playState === "stop" || playState === "pause") && <a href="#" onClick={(evt) => {evt.preventDefault(); playTrack(nowPlaying.pid);}}>▶️️</a>}
                    <a href="#" onClick={(evt) => {evt.preventDefault(); nextTrack(nowPlaying.pid);}}>⏭️</a>
                </PlayControls>
                <TrackTime>{secondsToMMSS(position)} / {secondsToMMSS(duration)}</TrackTime>
            </div>
            <Scrubber
                min={0}
                max={duration}
                value={position}
                onScrubStart={handleScrubStart}
                onScrubChange={handleScrubChange}
                onScrubEnd={handleScrubEnd}
            />
        </>
    )
}

function PlayerInfo({player}) {
    const [isScrubbing, setIsScrubbing] = React.useState(false)
    const [volume, setVolume] = React.useState(undefined)
    if (!player.nowPlaying) {
        return null;
    }
    if (!isScrubbing && volume !== player.nowPlaying.volume) {
        setVolume(player.nowPlaying.volume);
    }

    function handleVolumeScrubStart(value) {
        setIsScrubbing(true)
    }

    function handleVolumeScrubChange(value) {
        setIsScrubbing(true)
        setVolume(value)
    }

    function handleVolumeScrubEnd(value) {
        setIsScrubbing(false)
        setPlayerVolume(player.pid, value);
        setVolume(value)
    }
    return (
        <>
            <VolumeScrubberContainer>
                <Scrubber
                    vertical={true}
                    min={0}
                    max={100}
                    value={volume}
                    onScrubStart={handleVolumeScrubStart}
                    onScrubChange={handleVolumeScrubChange}
                    onScrubEnd={handleVolumeScrubEnd}
                />
            </VolumeScrubberContainer>
            <AlbumInfoContainer>
                <img alt={`${player.nowPlaying.artist} - ${player.nowPlaying.album}`} src={player.nowPlaying.image_url} />
                <SongMetadata nowPlaying={player.nowPlaying} />
            </AlbumInfoContainer>

            <Position nowPlaying={player.nowPlaying} />
        </>
    )
}

function App() {
  return (
    <div className="App">
      <HEOS />
    </div>
  );
}

export default App;
