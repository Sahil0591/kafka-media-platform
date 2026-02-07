FROM maven:3.9.12-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY . .
RUN mvn -pl media-api -am -DskipTests package spring-boot:repackage

FROM eclipse-temurin:25-jre-jammy
WORKDIR /app
COPY --from=build /workspace/media-api/target/media-api-*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
