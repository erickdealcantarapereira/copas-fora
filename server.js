const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const naipes = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const valores = ['A', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'];

let gameState = {
  maxPlayers: 4,
  players: [],
  deck: [],
  currentTurn: 0,
  trickCards: [],
  scores: {},
  roundScores: {},
  gameStarted: false
};

function createDeck() {
  let deck = [];
  for (let n of naipes) {
    for (let v of valores) {
      deck.push({ suit: n, value: v, id: `${v}${n}` });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function calculatePoints(cards) {
  let pts = 0;
  for (let c of cards) {
    if (c.suit === 'H') pts += 1;
    if (c.suit === 'S' && c.value === 'Q') pts += 10;
  }
  return pts;
}

io.on('connection', (socket) => {
  socket.on('joinGame', ({ name, numPlayers }) => {
    if (gameState.gameStarted) {
      socket.emit('errorMessage', 'O jogo já foi iniciado.');
      return;
    }

    if (gameState.players.length === 0 && numPlayers) {
      gameState.maxPlayers = parseInt(numPlayers);
    }

    if (gameState.players.length < gameState.maxPlayers) {
      gameState.players.push({ id: socket.id, name, hand: [] });
      if (!gameState.scores[name]) gameState.scores[name] = 0;
      gameState.roundScores[name] = 0;

      io.emit('updateState', gameState);

      if (gameState.players.length === gameState.maxPlayers) {
        startNewRound();
      }
    } else {
      socket.emit('errorMessage', 'A sala está cheia.');
    }
  });

  socket.on('playCard', (cardIndex) => {
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== gameState.currentTurn) return;

    const player = gameState.players[playerIndex];
    const playedCard = player.hand.splice(cardIndex, 1)[0];

    gameState.trickCards.push({ playerIndex, card: playedCard, playerName: player.name });
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.maxPlayers;

    if (gameState.trickCards.length === gameState.maxPlayers) {
      setTimeout(resolveTrick, 1500);
    }

    io.emit('updateState', gameState);
  });

  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    if (gameState.players.length === 0) {
      gameState.gameStarted = false;
      gameState.scores = {};
    }
    io.emit('updateState', gameState);
  });
});

function startNewRound() {
  gameState.gameStarted = true;
  gameState.deck = createDeck();
  const cardsPerPlayer = 40 / gameState.maxPlayers;

  gameState.players.forEach(p => {
    p.hand = gameState.deck.splice(0, cardsPerPlayer);
    gameState.roundScores[p.name] = 0;
  });

  gameState.currentTurn = 0;
  gameState.trickCards = [];
  io.emit('updateState', gameState);
}

function resolveTrick() {
  const leadSuit = gameState.trickCards[0].card.suit;
  let winnerIndex = 0;

  // Lógica simplificada de resolução da vazada pelo naipe de saída
  gameState.trickCards.forEach((item, index) => {
    if (item.card.suit === leadSuit) {
      winnerIndex = index;
    }
  });

  const winner = gameState.trickCards[winnerIndex];
  const pts = calculatePoints(gameState.trickCards.map(t => t.card));

  gameState.scores[winner.playerName] = (gameState.scores[winner.playerName] || 0) + pts;
  gameState.roundScores[winner.playerName] += pts;

  gameState.trickCards = [];
  gameState.currentTurn = winner.playerIndex;

  const totalHandCards = gameState.players.reduce((sum, p) => sum + p.hand.length, 0);
  if (totalHandCards === 0) {
    setTimeout(startNewRound, 3000);
  }

  io.emit('updateState', gameState);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));