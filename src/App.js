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

function secondsToMMSS(seconds) {
    if (isNaN(seconds)) {
        return '--:--';
    }
    return new Date(seconds * 1000).toISOString().substr(14, 5)
}

function MyComponent() {
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
              setActiveKey(data.payload[0].pid)
          }
          if (commandGroup === "player" && command === "get_now_playing_media") {
              const updatedPlayers = {...players};
              updatedPlayers[data.heos.message.parsed.pid].nowPlaying = {
                  ...updatedPlayers[data.heos.message.parsed.pid].nowPlaying,
                  ...data.payload
              };
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
      };
  })

  return (
      <Tabs
          activeKey={activeKey}
          onChange={({ activeKey }) => {
              setActiveKey(activeKey);
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
        return null;
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
            <TrackTime>{secondsToMMSS(position)} / {secondsToMMSS(duration)}</TrackTime>
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
    if (!player.nowPlaying) {
        return null;
    }
    return (
        <>
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
      <MyComponent />
    </div>
  );
}

export default App;
