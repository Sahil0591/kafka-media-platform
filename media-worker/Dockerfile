FROM maven:3.9.12-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY . .
RUN mvn -pl media-worker -am -DskipTests package spring-boot:repackage

FROM eclipse-temurin:25-jre-jammy
RUN apt-get update ; apt-get install -y ffmpeg ; rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /workspace/media-worker/target/media-worker-*.jar /app/app.jar
ENTRYPOINT ["java","-jar","/app/app.jar"]
