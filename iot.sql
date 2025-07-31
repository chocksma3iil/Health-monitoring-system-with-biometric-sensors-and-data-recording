USE iot_health;

CREATE TABLE IF NOT EXISTS donnees_sante (
  id INT AUTO_INCREMENT PRIMARY KEY,
  temp_corporelle FLOAT,
  temp_ambiante FLOAT,
  accX FLOAT,
  accY FLOAT,
  accZ FLOAT,
  horodatage TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP USER 'iot_user'@'localhost';

CREATE USER 'iot_user'@'localhost' IDENTIFIED BY 'iot_password';


DELETE FROM donnees_sante
ORDER BY id DESC
LIMIT 10;
ALTER USER 'iot_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'iot_password';
FLUSH PRIVILEGES;

SELECT * FROM donnees_sante;
