from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user so we can add profile fields without a painful migration later."""

    display_name = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return self.display_name or self.username
