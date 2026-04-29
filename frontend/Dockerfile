FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Viteを外部からアクセス可能にする
CMD ["npm", "run", "dev", "--", "--host"]