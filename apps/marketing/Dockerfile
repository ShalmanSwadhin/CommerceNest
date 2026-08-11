FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/marketing ./apps/marketing
RUN npm install
WORKDIR /app/apps/marketing
ARG VITE_ADMIN_URL=
ARG VITE_APP_URL=
ARG VITE_SUPPORT_EMAIL=
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/marketing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/marketing/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
